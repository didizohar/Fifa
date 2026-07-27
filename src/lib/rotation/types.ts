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
