import type { MatchType } from "../types/database";
import type {
  ActivePair,
  MatchResult,
  RandomFn,
  RotationPlayer,
  RotationReason,
  RotationValidationIssue,
  SelectionSource,
  WaitingQueueItem,
  WinnersStayRotationResult,
} from "./types";

/**
 * Pre-flight integrity check for the two pairs about to play -- catches
 * programmer errors (a singles match handed to a doubles-only rotation
 * mode, the same player appearing on both sides) that generateWinnersStayRotation
 * refuses to silently paper over. Data-hygiene issues that CAN legitimately
 * occur at runtime (a stale winner still sitting in the waiting queue, an
 * archived/deleted player in it) are handled separately and gracefully by
 * generateWinnersStayRotation/updateWaitingQueue instead of failing here.
 */
export function validateRotation(input: { matchType: MatchType; sideA: ActivePair; sideB: ActivePair }): RotationValidationIssue[] {
  const issues: RotationValidationIssue[] = [];
  if (input.matchType !== "doubles") {
    issues.push({ code: "notDoublesMatch", message: "Winners Stay only applies to doubles matches." });
  }

  const allIds = [...input.sideA.players, ...input.sideB.players].map((p) => p.id);
  if (new Set(allIds).size !== allIds.length) {
    issues.push({ code: "duplicatePlayer", message: "The same player appears more than once across the two pairs." });
  }

  return issues;
}

/**
 * Draws are expected to be rare, but when one happens the pair with MORE
 * consecutive matches played (including the just-finished draw) rotates
 * out; the pair with fewer stays. An exact tie is broken with `random`
 * (unbiased 50/50), never favoring either side.
 */
export function resolveDrawRotation(sideA: ActivePair, sideB: ActivePair, random: RandomFn = Math.random): { staying: ActivePair; rotatingOut: ActivePair } {
  if (sideA.consecutiveMatchesPlayed === sideB.consecutiveMatchesPlayed) {
    return random() < 0.5 ? { staying: sideA, rotatingOut: sideB } : { staying: sideB, rotatingOut: sideA };
  }
  return sideA.consecutiveMatchesPlayed > sideB.consecutiveMatchesPlayed ? { staying: sideB, rotatingOut: sideA } : { staying: sideA, rotatingOut: sideB };
}

/** Longest-waiting players first (ties broken by playerId, never randomly), taking at most `count`. */
export function selectWaitingPlayers(queue: WaitingQueueItem[], count: number): WaitingQueueItem[] {
  return [...queue].sort((a, b) => a.enteredQueueAt - b.enteredQueueAt || a.playerId.localeCompare(b.playerId)).slice(0, Math.max(0, count));
}

/** Unbiased 50/50 pick of exactly one player from the LOSING pair -- callers must never pass a winning pair here. */
export function selectRandomLosingPlayer(losingPair: [RotationPlayer, RotationPlayer], random: RandomFn = Math.random): { selected: RotationPlayer; remaining: RotationPlayer } {
  const [a, b] = losingPair;
  return random() < 0.5 ? { selected: a, remaining: b } : { selected: b, remaining: a };
}

export interface UpdateWaitingQueueParams {
  queue: WaitingQueueItem[];
  /** Queue entries who are entering the next match -- removed from the queue. */
  selected: WaitingQueueItem[];
  /** Losing players joining the END of the queue this rotation. */
  rotatedOut: RotationPlayer[];
  /** Ids of the pair staying on the field -- a winner can never sit in the waiting queue. */
  winningPlayerIds: readonly string[];
  /** Ids of players currently considered active (not archived, not deleted) -- anyone else is dropped from the queue. */
  activePlayerIds: readonly string[];
  /** Monotonic counter used to assign enteredQueueAt to newly-queued players, so ordering stays deterministic. */
  sequence: number;
}

/**
 * Advances the waiting queue by one rotation: drops the selected entrants
 * and the winning pair (winners can never be queued), safely drops any
 * archived/deleted player, ages everyone still waiting by one
 * consecutiveWaitCount, then appends the rotated-out losers at the end.
 */
export function updateWaitingQueue(params: UpdateWaitingQueueParams): WaitingQueueItem[] {
  const selectedIds = new Set(params.selected.map((s) => s.playerId));
  const winnerIds = new Set(params.winningPlayerIds);

  const stillWaiting = params.queue
    .filter((item) => !selectedIds.has(item.playerId))
    .filter((item) => !winnerIds.has(item.playerId))
    .filter((item) => params.activePlayerIds.includes(item.playerId))
    .map((item) => ({ ...item, consecutiveWaitCount: item.consecutiveWaitCount + 1 }));

  const alreadyQueuedIds = new Set(stillWaiting.map((item) => item.playerId));
  const newlyQueued: WaitingQueueItem[] = params.rotatedOut
    .filter((p) => params.activePlayerIds.includes(p.id))
    .filter((p) => !alreadyQueuedIds.has(p.id))
    .map((p, index) => ({ playerId: p.id, enteredQueueAt: params.sequence + index, consecutiveWaitCount: 0 }));

  return [...stillWaiting, ...newlyQueued];
}

/** Increments a pair's streak by one -- call on the staying pair once a rotation is accepted, before it becomes next round's sideA/sideB input. */
export function incrementConsecutiveMatches(pair: ActivePair): ActivePair {
  return { ...pair, consecutiveMatchesPlayed: pair.consecutiveMatchesPlayed + 1 };
}

/** A freshly-entered pair always starts at 1 (this match counts as their first), per Stage 7's spec. */
export function startingConsecutiveMatches(players: [RotationPlayer, RotationPlayer]): ActivePair {
  return { players, consecutiveMatchesPlayed: 1 };
}

export interface GenerateRotationInput {
  matchType: MatchType;
  sideA: ActivePair;
  sideB: ActivePair;
  result: MatchResult;
  waitingQueue: WaitingQueueItem[];
  /** Resolves a waiting-queue playerId to its full player record for the result's opposingPair/rotatedOutPlayers. */
  playersById: Record<string, RotationPlayer>;
  /** Ids of players considered active right now -- anyone else already in the queue (archived/deleted since they joined) is dropped safely rather than surfaced. */
  activePlayerIds: readonly string[];
  /** Monotonic counter for assigning enteredQueueAt to newly-queued players. */
  sequence: number;
  random?: RandomFn;
}

/**
 * The core "Winners Stay" rule, one rotation at a time:
 *  - the winning pair (or, on a draw, whichever pair has played fewer
 *    consecutive matches -- resolveDrawRotation) always stays, never split
 *  - two waiting players (longest-waiting first) enter together when
 *    available: Cases 1 and 3
 *  - exactly one waiting player enters and is randomly paired with ONE
 *    player from the losing pair when only one is waiting: Case 2
 *  - nothing rotates (opposingPair is null) when nobody is waiting: Case 4
 * Throws only for programmer errors (see validateRotation) -- a singles
 * match or a duplicate player id across the two pairs. Everything else
 * (a stale winner or archived/deleted player already in the queue) is
 * sanitized rather than treated as fatal.
 */
export function generateWinnersStayRotation(input: GenerateRotationInput): WinnersStayRotationResult {
  const random = input.random ?? Math.random;
  const blocking = validateRotation({ matchType: input.matchType, sideA: input.sideA, sideB: input.sideB });
  if (blocking.length > 0) throw new Error(blocking.map((issue) => issue.message).join(" "));

  let staying: ActivePair;
  let rotatingOut: ActivePair;
  let wasDraw = false;

  if (input.result === "draw") {
    const resolved = resolveDrawRotation(input.sideA, input.sideB, random);
    staying = resolved.staying;
    rotatingOut = resolved.rotatingOut;
    wasDraw = true;
  } else {
    staying = input.result === "sideA" ? input.sideA : input.sideB;
    rotatingOut = input.result === "sideA" ? input.sideB : input.sideA;
  }

  const stayingIds = staying.players.map((p) => p.id);
  // Defensive sanitation: a winner can never be queued, and an
  // archived/deleted player shouldn't linger in a stale queue either.
  const sanitizedQueue = input.waitingQueue.filter((item) => !stayingIds.includes(item.playerId) && input.activePlayerIds.includes(item.playerId));

  const availableWaiting = selectWaitingPlayers(sanitizedQueue, 2);

  if (availableWaiting.length === 0) {
    // Case 4: nobody waiting -- no automatic next match, nothing rotates.
    return {
      stayingPair: staying.players,
      opposingPair: null,
      waitingPlayers: sanitizedQueue,
      rotatedOutPlayers: [],
      selectionSource: "none",
      reason: { key: "rotation.reasonNotEnoughWaiting", params: {} },
      drawRotationApplied: wasDraw,
    };
  }

  let opposingPair: [RotationPlayer, RotationPlayer];
  let selectionSource: SelectionSource;
  let rotatedOutPlayers: RotationPlayer[];
  let selectedQueueEntries: WaitingQueueItem[];
  let reason: RotationReason;

  if (availableWaiting.length === 1) {
    // Case 2: one waiting player, randomly paired with one loser (never a winner).
    const waitingPlayer = input.playersById[availableWaiting[0]!.playerId]!;
    const { selected, remaining } = selectRandomLosingPlayer(rotatingOut.players, random);
    opposingPair = [waitingPlayer, selected];
    rotatedOutPlayers = [remaining];
    selectedQueueEntries = availableWaiting;
    selectionSource = "randomFromLosers";
    reason = { key: "rotation.reasonRandomPartner", params: { waitingName: waitingPlayer.display_name, partnerName: selected.display_name } };
  } else {
    // Cases 1 & 3: two waiting players (longest-waiting first) enter together; both losers rotate out.
    const [first, second] = availableWaiting as [WaitingQueueItem, WaitingQueueItem];
    opposingPair = [input.playersById[first.playerId]!, input.playersById[second.playerId]!];
    rotatedOutPlayers = rotatingOut.players;
    selectedQueueEntries = [first, second];
    selectionSource = "waitingQueue";
    reason = { key: "rotation.reasonWaitingEnter", params: { firstName: opposingPair[0].display_name, secondName: opposingPair[1].display_name } };
  }

  const waitingPlayers = updateWaitingQueue({
    queue: sanitizedQueue,
    selected: selectedQueueEntries,
    rotatedOut: rotatedOutPlayers,
    winningPlayerIds: stayingIds,
    activePlayerIds: input.activePlayerIds,
    sequence: input.sequence,
  });

  return { stayingPair: staying.players, opposingPair, waitingPlayers, rotatedOutPlayers, selectionSource, reason, drawRotationApplied: wasDraw };
}
