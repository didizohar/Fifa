/** Minimal player shape the rotation engine needs -- MatchSidePlayer/PlayerProfile both already satisfy this structurally, same convention as analytics/matches.ts. */
export interface RotationPlayer {
  id: string;
  display_name: string;
  avatar_url: string | null;
  custom_color: string;
}

/** A pair currently on the field, plus how many matches in a row they've stayed -- reset to 0 the moment they rotate out, per Stage 7's "Winners Stay" spec. */
export interface ActivePair {
  players: [RotationPlayer, RotationPlayer];
  consecutiveMatchesPlayed: number;
}

export interface WaitingQueueItem {
  playerId: string;
  /** A caller-assigned monotonic sequence number (not a wall-clock timestamp) -- keeps ordering deterministic and test-friendly regardless of when a test runs. Lower = entered the queue earlier. */
  enteredQueueAt: number;
  /** How many rotations this player has been passed over while waiting. */
  consecutiveWaitCount: number;
}

/** How the incoming (opposing) pair was assembled. "none" means Case 4 -- no automatic next match. */
export type SelectionSource = "waitingQueue" | "randomFromLosers" | "none";

/** A translation key + params, same convention as trends/explanations.ts's TrendExplanation -- never raw English, always localizable. */
export interface RotationReason {
  key: string;
  params: Record<string, string | number>;
}

export interface WinnersStayRotationResult {
  stayingPair: [RotationPlayer, RotationPlayer];
  opposingPair: [RotationPlayer, RotationPlayer] | null;
  waitingPlayers: WaitingQueueItem[];
  rotatedOutPlayers: RotationPlayer[];
  selectionSource: SelectionSource;
  reason: RotationReason;
  /** True when the staying pair was decided by the draw-resolution rule (fewer consecutive matches played) rather than by winning outright. */
  drawRotationApplied: boolean;
}

/** Returns a float in [0, 1) -- inject a seeded implementation in tests instead of relying on Math.random. */
export type RandomFn = () => number;

export type MatchResult = "sideA" | "sideB" | "draw";

export interface RotationValidationIssue {
  code: "notDoublesMatch" | "duplicatePlayer";
  message: string;
}

export type WinnersStaySessionStatus = "active" | "completed";

/** Enough of the session to restore it verbatim -- session.ts's one-slot undo buffer. */
export interface WinnersStaySessionSnapshot {
  currentPairA: ActivePair;
  currentPairB: ActivePair | null;
  waitingQueue: WaitingQueueItem[];
  roundNumber: number;
  lastRecordedMatchId: string | null;
  updatedAt: string;
}

/**
 * A persistent Winners Stay session spanning an entire playing evening.
 * currentPairA/currentPairB are the two pairs actually accepted to play
 * next; pendingRotation is a freshly-computed (and possibly redrawn)
 * rotation still under review -- nothing about it is committed
 * (currentPairB/waitingQueue) until acceptPendingRotation runs.
 */
export interface WinnersStaySession {
  id: string;
  groupId: string;
  /** Every player eligible for this session (the pool the rotation draws from) -- not necessarily still all "active" by the time the session ends. */
  activePlayerIds: string[];
  currentPairA: ActivePair;
  /** Null while this round's opposing pair is still a pending (possibly redrawable) preview, or during a Case 4 "waiting for players" gap. */
  currentPairB: ActivePair | null;
  pendingRotation: WinnersStayRotationResult | null;
  waitingQueue: WaitingQueueItem[];
  /** Completed rounds so far (a round completes the instant its match result is recorded, independent of whether its next-match preview has been accepted yet). */
  roundNumber: number;
  /** ISO 8601, same convention as matches.ts's played_at / created_at. */
  startedAt: string;
  updatedAt: string;
  /** Idempotency guard -- advanceWinnersStaySession refuses to run twice for the same matchId. */
  lastRecordedMatchId: string | null;
  status: WinnersStaySessionStatus;
  /** Highest consecutiveMatchesPlayed any pair has reached this session, updated as pairs rotate out (and, at summary time, compared against whichever pair is still on court). */
  longestWinningRun: number;
  previousSnapshot: WinnersStaySessionSnapshot | null;
}

export interface WinnersStaySessionSummary {
  roundsPlayed: number;
  durationMs: number;
  playersUsedCount: number;
  longestWinningRun: number;
  finalWaitingQueue: WaitingQueueItem[];
}
