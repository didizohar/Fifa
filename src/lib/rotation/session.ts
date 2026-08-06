import { generateWinnersStayRotation, incrementConsecutiveMatches, selectRandomLosingPlayer, selectWaitingPlayers, startingConsecutiveMatches } from "./winnersStay";
import type {
  ActivePair,
  MatchResult,
  RandomFn,
  RotationPlayer,
  SessionFormat,
  WaitingQueueItem,
  WinnersStaySession,
  WinnersStaySessionSnapshot,
  WinnersStaySessionSummary,
} from "./types";

function pairContainsPlayer(pair: ActivePair, playerId: string): boolean {
  return pair.players.some((p) => p.id === playerId);
}

function snapshotOf(session: WinnersStaySession): WinnersStaySessionSnapshot {
  return {
    currentPairA: session.currentPairA,
    currentPairB: session.currentPairB,
    waitingQueue: session.waitingQueue,
    roundNumber: session.roundNumber,
    lastRecordedMatchId: session.lastRecordedMatchId,
    updatedAt: session.updatedAt,
  };
}

function reindexQueue(queue: WaitingQueueItem[]): WaitingQueueItem[] {
  return queue.map((item, index) => ({ ...item, enteredQueueAt: index }));
}

function shuffle<T>(items: T[], random: RandomFn): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Randomly splits >= 4 selected players into two starting pairs plus a waiting group, using an injectable shuffle -- no Elo, no hidden randomness. Unchanged: still the "group" (4+) format's only entry point. */
export function drawRandomInitialPairs(players: RotationPlayer[], random: RandomFn = Math.random): { pairA: [RotationPlayer, RotationPlayer]; pairB: [RotationPlayer, RotationPlayer]; waiting: RotationPlayer[] } {
  if (players.length < 4) throw new Error("Winners Stay needs at least four players to start a session.");
  const shuffled = shuffle(players, random);
  return { pairA: [shuffled[0]!, shuffled[1]!], pairB: [shuffled[2]!, shuffled[3]!], waiting: shuffled.slice(4) };
}

/**
 * Randomly splits exactly 2 or 3 selected players into two 1-player sides
 * plus an optional single waiting player -- the "duo"/"trio" formats'
 * counterpart to drawRandomInitialPairs. 2 players -> no one waits (duo
 * has no rotation, ever); 3 -> exactly one waits (trio).
 */
export function drawInitialSingleSides(players: RotationPlayer[], random: RandomFn = Math.random): { sideA: RotationPlayer[]; sideB: RotationPlayer[]; waiting: RotationPlayer[] } {
  if (players.length !== 2 && players.length !== 3) {
    throw new Error("A duo or trio Winners Stay session needs exactly 2 or 3 players.");
  }
  const shuffled = shuffle(players, random);
  return { sideA: [shuffled[0]!], sideB: [shuffled[1]!], waiting: shuffled.slice(2) };
}

export interface StartSessionParams {
  id: string;
  groupId: string;
  format: SessionFormat;
  pairA: RotationPlayer[];
  pairB: RotationPlayer[];
  waitingPlayers: RotationPlayer[];
  activePlayerIds: string[];
  now: Date;
}

/** Bootstraps a fresh session -- both starting sides begin at consecutiveMatchesPlayed 1 (Stage 7's "starts at 1 after the pair first enters"), waiting players queue in the given order. Same entry point for every format; only the caller-supplied pairA/pairB/format differ. */
export function startWinnersStaySession(params: StartSessionParams): WinnersStaySession {
  const nowIso = params.now.toISOString();
  return {
    id: params.id,
    groupId: params.groupId,
    format: params.format,
    activePlayerIds: params.activePlayerIds,
    currentPairA: startingConsecutiveMatches(params.pairA),
    currentPairB: startingConsecutiveMatches(params.pairB),
    pendingRotation: null,
    waitingQueue: params.waitingPlayers.map((p, index) => ({ playerId: p.id, enteredQueueAt: index, consecutiveWaitCount: 0 })),
    roundNumber: 0,
    startedAt: nowIso,
    updatedAt: nowIso,
    lastRecordedMatchId: null,
    status: "active",
    longestWinningRun: 1,
    previousSnapshot: null,
  };
}

/** True only when the session is active and this matchId hasn't already advanced it -- callers should check before calling advanceWinnersStaySession, which throws otherwise. */
export function canAdvanceSession(session: WinnersStaySession, matchId: string): boolean {
  return session.status === "active" && session.lastRecordedMatchId !== matchId && session.currentPairB !== null;
}

/**
 * True when `matchId` is the exact match that most recently advanced this
 * session's rotation. Editing that match doesn't touch session state at
 * all (nothing here re-runs advanceWinnersStaySession), so the queue and
 * currentPairA/B are never at risk of double-advancing -- this is purely
 * so the edit screen can warn the user that the *next* rotation may now be
 * based on a stale result.
 */
export function isMatchLinkedToActiveWinnersStaySession(session: WinnersStaySession | null, matchId: string): boolean {
  return !!session && session.status === "active" && session.lastRecordedMatchId === matchId;
}

export interface AdvanceSessionParams {
  session: WinnersStaySession;
  matchId: string;
  result: MatchResult;
  /** Resolves every waiting-queue playerId (plus the two current pairs) to full player info -- same contract as generateWinnersStayRotation's playersById. */
  playersById: Record<string, RotationPlayer>;
  activePlayerIds: readonly string[];
  now: Date;
  random?: RandomFn;
}

/**
 * Records one match's result against the session's current matchup and
 * computes (but does not yet commit) the next rotation. currentPairA
 * updates immediately to the determined staying pair -- that part is never
 * subject to redraw. currentPairB/waitingQueue stay as they were until
 * acceptPendingRotation runs, so a Redraw Partner in between never touches
 * committed state. Throws if this exact match already advanced the
 * session, or if there's no accepted opposing pair yet to play against
 * (check canAdvanceSession first).
 *
 * Only valid for "trio" and "group" sessions -- a "duo" session has no
 * rotation at all (see advanceDuoSession).
 */
export function advanceWinnersStaySession(params: AdvanceSessionParams): WinnersStaySession {
  if (!canAdvanceSession(params.session, params.matchId)) {
    throw new Error("This match has already advanced this Winners Stay session, or there is no active matchup to record against.");
  }
  if (params.session.format === "duo") {
    throw new Error("A duo session has no rotation -- use advanceDuoSession instead.");
  }

  const sideA = params.session.currentPairA;
  const sideB = params.session.currentPairB!;
  const sequence = params.session.roundNumber * 1000 + 1;

  const rotation = generateWinnersStayRotation({
    matchType: params.session.format === "group" ? "doubles" : "singles",
    sideA,
    sideB,
    result: params.result,
    waitingQueue: params.session.waitingQueue,
    playersById: params.playersById,
    activePlayerIds: params.activePlayerIds,
    sequence,
    random: params.random,
  });

  const stayingWasA = pairContainsPlayer(sideA, rotation.stayingPair[0].id);
  const previousStayingPair = stayingWasA ? sideA : sideB;
  const previousRotatedPair = stayingWasA ? sideB : sideA;

  const newCurrentPairA: ActivePair = { players: rotation.stayingPair, consecutiveMatchesPlayed: previousStayingPair.consecutiveMatchesPlayed + 1 };
  const longestWinningRun = Math.max(params.session.longestWinningRun, previousRotatedPair.consecutiveMatchesPlayed, newCurrentPairA.consecutiveMatchesPlayed);

  return {
    ...params.session,
    previousSnapshot: snapshotOf(params.session),
    currentPairA: newCurrentPairA,
    currentPairB: null,
    pendingRotation: rotation,
    roundNumber: params.session.roundNumber + 1,
    lastRecordedMatchId: params.matchId,
    updatedAt: params.now.toISOString(),
    longestWinningRun,
  };
}

/**
 * A "duo" session's counterpart to advanceWinnersStaySession -- duo has no
 * waiting queue and no rotation, ever ("1 vs 1 -- no rotation" per spec),
 * so recording a match never changes who's playing: currentPairA/
 * currentPairB stay exactly as they are, immediately ready for the next
 * match with zero pending-rotation review step. Only the round count,
 * idempotency guard, and each side's own consecutive-matches streak (kept
 * accurate for computeSessionSummary's longestWinningRun, even though nothing
 * ever actually rotates for a duo) advance.
 */
export function advanceDuoSession(session: WinnersStaySession, matchId: string, now: Date): WinnersStaySession {
  if (session.format !== "duo") {
    throw new Error("advanceDuoSession is only valid for a duo session -- use advanceWinnersStaySession for trio/group.");
  }
  if (!canAdvanceSession(session, matchId)) {
    throw new Error("This match has already advanced this Winners Stay session, or there is no active matchup to record against.");
  }

  const currentPairA = incrementConsecutiveMatches(session.currentPairA);
  const currentPairB = session.currentPairB ? incrementConsecutiveMatches(session.currentPairB) : null;

  return {
    ...session,
    previousSnapshot: snapshotOf(session),
    currentPairA,
    currentPairB,
    roundNumber: session.roundNumber + 1,
    lastRecordedMatchId: matchId,
    updatedAt: now.toISOString(),
    longestWinningRun: Math.max(session.longestWinningRun, currentPairA.consecutiveMatchesPlayed),
  };
}

/**
 * Re-picks which of the two known losers partners the waiting player --
 * only valid when the pending rotation's opposing pair came from
 * selectionSource "randomFromLosers". Never touches currentPairA/B or the
 * waiting queue, since nothing is committed until acceptPendingRotation.
 */
export function redrawSessionPartner(session: WinnersStaySession, random: RandomFn = Math.random): WinnersStaySession {
  const pending = session.pendingRotation;
  if (!pending || pending.selectionSource !== "randomFromLosers" || !pending.opposingPair) {
    throw new Error("Redraw is only available when a random partner was drawn from the losing pair.");
  }
  const waitingHalf = pending.opposingPair[0];
  const currentlyPlaying = pending.opposingPair[1];
  const currentlyWaiting = pending.rotatedOutPlayers[0]!;
  const picked = selectRandomLosingPlayer([currentlyPlaying, currentlyWaiting], random);

  return { ...session, pendingRotation: { ...pending, opposingPair: [waitingHalf, picked.selected], rotatedOutPlayers: [picked.remaining] } };
}

/** Commits the current pendingRotation into currentPairB/waitingQueue. Throws if there's nothing to accept (no pending rotation, or Case 4's "not enough players" with no opposing pair). */
export function acceptPendingRotation(session: WinnersStaySession, now: Date): WinnersStaySession {
  if (!session.pendingRotation?.opposingPair) {
    throw new Error("There is no pending rotation with an opposing pair to accept.");
  }
  return {
    ...session,
    currentPairB: { players: session.pendingRotation.opposingPair, consecutiveMatchesPlayed: 1 },
    waitingQueue: session.pendingRotation.waitingPlayers,
    pendingRotation: null,
    updatedAt: now.toISOString(),
  };
}

/**
 * Case 4 recovery: after a round ends with nobody waiting, the session sits
 * with currentPairB null and no pending opposing pair. Once the waiting
 * queue has been edited (e.g. a player added), call this to try again --
 * it never touches roundNumber/lastRecordedMatchId since no new match was
 * played, only the pairing for the still-pending round.
 */
export function retryPendingRotation(session: WinnersStaySession, playersById: Record<string, RotationPlayer>, now: Date): WinnersStaySession {
  const available = selectWaitingPlayers(session.waitingQueue, 2);
  if (available.length < 2) {
    return {
      ...session,
      pendingRotation: {
        stayingPair: session.currentPairA.players,
        opposingPair: null,
        waitingPlayers: session.waitingQueue,
        rotatedOutPlayers: [],
        selectionSource: "none",
        reason: { key: "rotation.reasonNotEnoughWaiting", params: {} },
        drawRotationApplied: false,
      },
      updatedAt: now.toISOString(),
    };
  }

  const [first, second] = available as [(typeof available)[number], (typeof available)[number]];
  const opposingPair: [RotationPlayer, RotationPlayer] = [playersById[first.playerId]!, playersById[second.playerId]!];
  const remainingQueue = reindexQueue(session.waitingQueue.filter((item) => item.playerId !== first.playerId && item.playerId !== second.playerId));

  return {
    ...session,
    pendingRotation: {
      stayingPair: session.currentPairA.players,
      opposingPair,
      waitingPlayers: remainingQueue,
      rotatedOutPlayers: [],
      selectionSource: "waitingQueue",
      reason: { key: "rotation.reasonWaitingEnter", params: { firstName: opposingPair[0].display_name, secondName: opposingPair[1].display_name } },
      drawRotationApplied: false,
    },
    updatedAt: now.toISOString(),
  };
}

/** Restores the single stored snapshot (undoing the last accepted-or-not rotation decision) -- never touches recorded matches themselves, only the session's own rotation state. Throws if there's nothing to undo. */
export function undoLastRotation(session: WinnersStaySession, now: Date): WinnersStaySession {
  if (!session.previousSnapshot) throw new Error("There is no rotation to undo.");
  const snap = session.previousSnapshot;
  return {
    ...session,
    currentPairA: snap.currentPairA,
    currentPairB: snap.currentPairB,
    waitingQueue: snap.waitingQueue,
    roundNumber: snap.roundNumber,
    lastRecordedMatchId: snap.lastRecordedMatchId,
    pendingRotation: null,
    previousSnapshot: null,
    updatedAt: now.toISOString(),
  };
}

export function moveQueueEntry(queue: WaitingQueueItem[], playerId: string, direction: "up" | "down"): WaitingQueueItem[] {
  const ordered = selectWaitingPlayers(queue, queue.length);
  const index = ordered.findIndex((item) => item.playerId === playerId);
  if (index === -1) return queue;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= ordered.length) return queue;
  const next = [...ordered];
  [next[index], next[swapWith]] = [next[swapWith]!, next[index]!];
  return reindexQueue(next);
}

export function removeFromQueue(queue: WaitingQueueItem[], playerId: string): WaitingQueueItem[] {
  return reindexQueue(queue.filter((item) => item.playerId !== playerId));
}

/** Appends at the end by default -- refuses a duplicate, and refuses anyone already on the court (excludeIds). */
export function addToQueue(queue: WaitingQueueItem[], player: RotationPlayer, excludeIds: readonly string[] = []): WaitingQueueItem[] {
  if (queue.some((item) => item.playerId === player.id) || excludeIds.includes(player.id)) return queue;
  return [...queue, { playerId: player.id, enteredQueueAt: queue.length, consecutiveWaitCount: 0 }];
}

/** Safely drops any queued player no longer in the active roster (archived or deleted since they joined the queue). */
export function cleanupInactiveQueueEntries(queue: WaitingQueueItem[], activePlayerIds: readonly string[]): WaitingQueueItem[] {
  return reindexQueue(queue.filter((item) => activePlayerIds.includes(item.playerId)));
}

export function endSession(session: WinnersStaySession, now: Date): WinnersStaySession {
  return { ...session, status: "completed", updatedAt: now.toISOString() };
}

/** Rounds played, duration, and the longest winning-pair run this session produced -- no tournament-style statistics beyond what Stage 7 asked for. */
export function computeSessionSummary(session: WinnersStaySession): WinnersStaySessionSummary {
  const startedAtMs = new Date(session.startedAt).getTime();
  const endedAtMs = new Date(session.updatedAt).getTime();
  return {
    roundsPlayed: session.roundNumber,
    durationMs: Math.max(0, endedAtMs - startedAtMs),
    playersUsedCount: session.activePlayerIds.length,
    longestWinningRun: Math.max(session.longestWinningRun, session.currentPairA.consecutiveMatchesPlayed),
    finalWaitingQueue: session.waitingQueue,
  };
}
