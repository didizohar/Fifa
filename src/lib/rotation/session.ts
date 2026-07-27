import { generateWinnersStayRotation, selectRandomLosingPlayer, selectWaitingPlayers, startingConsecutiveMatches } from "./winnersStay";
import type {
  ActivePair,
  MatchResult,
  RandomFn,
  RotationPlayer,
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

/** Randomly splits >= 4 selected players into two starting pairs plus a waiting group, using an injectable shuffle -- no Elo, no hidden randomness. */
export function drawRandomInitialPairs(players: RotationPlayer[], random: RandomFn = Math.random): { pairA: [RotationPlayer, RotationPlayer]; pairB: [RotationPlayer, RotationPlayer]; waiting: RotationPlayer[] } {
  if (players.length < 4) throw new Error("Winners Stay needs at least four players to start a session.");
  const shuffled = shuffle(players, random);
  return { pairA: [shuffled[0]!, shuffled[1]!], pairB: [shuffled[2]!, shuffled[3]!], waiting: shuffled.slice(4) };
}

export interface StartSessionParams {
  id: string;
  groupId: string;
  pairA: [RotationPlayer, RotationPlayer];
  pairB: [RotationPlayer, RotationPlayer];
  waitingPlayers: RotationPlayer[];
  activePlayerIds: string[];
  now: Date;
}

/** Bootstraps a fresh session -- both starting pairs begin at consecutiveMatchesPlayed 1 (Stage 7's "starts at 1 after the pair first enters"), waiting players queue in the given order. */
export function startWinnersStaySession(params: StartSessionParams): WinnersStaySession {
  const nowIso = params.now.toISOString();
  return {
    id: params.id,
    groupId: params.groupId,
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
 */
export function advanceWinnersStaySession(params: AdvanceSessionParams): WinnersStaySession {
  if (!canAdvanceSession(params.session, params.matchId)) {
    throw new Error("This match has already advanced this Winners Stay session, or there is no active matchup to record against.");
  }

  const sideA = params.session.currentPairA;
  const sideB = params.session.currentPairB!;
  const sequence = params.session.roundNumber * 1000 + 1;

  const rotation = generateWinnersStayRotation({
    matchType: "doubles",
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
