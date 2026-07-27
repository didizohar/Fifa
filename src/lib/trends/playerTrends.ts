import { normalizeMatchDate } from "../analytics/dateRange";
import type { MatchSidePlayer, MatchSummary } from "../matches";
import { computeConsistency, computePlayerStats, computeStreaks, findSides, computeGoalStats } from "../stats";
import type { SideResult } from "../types/database";
import type { PlayerTrendMetrics, TrendDirection, TrendOptions, TrendWindowOptions } from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function populationStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

const DEFAULT_RECENT_WINDOW = 5;
const DEFAULT_PREVIOUS_WINDOW = 5;
const DEFAULT_MIN_TOTAL_MATCHES = 4;

const DEFAULT_WINDOW_OPTIONS: Required<TrendWindowOptions> = {
  recentWindowSize: DEFAULT_RECENT_WINDOW,
  previousWindowSize: DEFAULT_PREVIOUS_WINDOW,
  minTotalMatches: DEFAULT_MIN_TOTAL_MATCHES,
};

function resolveWindowOptions(options: TrendWindowOptions): Required<TrendWindowOptions> {
  return {
    recentWindowSize: options.recentWindowSize ?? DEFAULT_WINDOW_OPTIONS.recentWindowSize,
    previousWindowSize: options.previousWindowSize ?? DEFAULT_WINDOW_OPTIONS.previousWindowSize,
    minTotalMatches: options.minTotalMatches ?? DEFAULT_WINDOW_OPTIONS.minTotalMatches,
  };
}

export interface TrendWindows {
  /** Most recent matchesConsidered.recentWindowSize matches (or a proportional slice below the fallback floor). */
  recent: MatchSummary[];
  /** The matches immediately before `recent`. */
  previous: MatchSummary[];
  /** Every one of the player's own, validly-dated matches, most recent first -- recent+previous is always a prefix of this. */
  ordered: MatchSummary[];
}

/**
 * Splits a player's own match history into a "recent" and "previous"
 * window, most-recent-first. Windows are sized by match COUNT, not
 * calendar time, so players who play at very different frequencies still
 * get a fair comparison. At >= recentWindowSize + previousWindowSize
 * matches, uses those fixed sizes; below that (but >= minTotalMatches),
 * falls back to an even proportional split so a thin history still gets an
 * honest before/after comparison instead of an empty previous window. Below
 * minTotalMatches, returns null -- the caller reports "insufficientData".
 *
 * Matches with an unparseable played_at are dropped (consistent with
 * analytics/dateRange.ts's normalizeMatchDate). Ties on played_at (duplicate
 * timestamps) are broken by match id, so window membership never depends on
 * incidental array order.
 */
export function selectTrendWindows(playerId: string, matches: MatchSummary[], options: TrendWindowOptions = {}): TrendWindows | null {
  const resolved = resolveWindowOptions(options);

  const ordered = matches
    .map((match) => ({ match, date: normalizeMatchDate(match.played_at) }))
    .filter((row): row is { match: MatchSummary; date: Date } => row.date !== null && findSides(playerId, row.match) !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime() || a.match.id.localeCompare(b.match.id))
    .map((row) => row.match);

  const total = ordered.length;
  if (total < resolved.minTotalMatches) return null;

  if (total >= resolved.recentWindowSize + resolved.previousWindowSize) {
    return {
      recent: ordered.slice(0, resolved.recentWindowSize),
      previous: ordered.slice(resolved.recentWindowSize, resolved.recentWindowSize + resolved.previousWindowSize),
      ordered,
    };
  }

  const recentSize = Math.ceil(total / 2);
  return { recent: ordered.slice(0, recentSize), previous: ordered.slice(recentSize), ordered };
}

const EXTREME_MARGIN = 3;
const LOW_CONCEDE_THRESHOLD = 1;

interface WindowStats {
  played: number;
  winRate: number;
  lossRate: number;
  goalsPerMatch: number;
  goalsAgainstPerMatch: number;
  goalDifferencePerMatch: number;
  goalsScoredTotal: number;
  goalsScoredStdDev: number;
  /** Share (0-1) of matches decided by a 3+ goal margin either way. */
  extremeMatchShare: number;
  /** Share (0-1) of matches conceding at most 1 goal. */
  lowConcedingShare: number;
}

const EMPTY_WINDOW_STATS: WindowStats = {
  played: 0,
  winRate: 0,
  lossRate: 0,
  goalsPerMatch: 0,
  goalsAgainstPerMatch: 0,
  goalDifferencePerMatch: 0,
  goalsScoredTotal: 0,
  goalsScoredStdDev: 0,
  extremeMatchShare: 0,
  lowConcedingShare: 0,
};

/** Reuses stats.ts's computePlayerStats/computeGoalStats for the shared fields, adding only what they don't already cover (goal-scored spread, extreme-margin share, low-conceding share) -- all in one extra pass over the window. */
function buildWindowStats(playerId: string, windowMatches: MatchSummary[]): WindowStats {
  const stats = computePlayerStats(playerId, windowMatches);
  if (stats.played === 0) return EMPTY_WINDOW_STATS;

  const goals = computeGoalStats(playerId, windowMatches);
  const perMatchGoals: number[] = [];
  let extremeCount = 0;
  let lowConcedeCount = 0;

  for (const match of windowMatches) {
    const sides = findSides(playerId, match);
    if (!sides) continue;
    perMatchGoals.push(sides.own.score);
    if (Math.abs(sides.own.score - sides.opponent.score) >= EXTREME_MARGIN) extremeCount++;
    if (sides.opponent.score <= LOW_CONCEDE_THRESHOLD) lowConcedeCount++;
  }

  return {
    played: stats.played,
    winRate: stats.winRate ?? 0,
    lossRate: stats.losses / stats.played,
    goalsPerMatch: goals.goalsPerMatch ?? 0,
    goalsAgainstPerMatch: goals.goalsConceded / stats.played,
    goalDifferencePerMatch: (goals.goalsScored - goals.goalsConceded) / stats.played,
    goalsScoredTotal: goals.goalsScored,
    goalsScoredStdDev: populationStdDev(perMatchGoals),
    extremeMatchShare: extremeCount / stats.played,
    lowConcedingShare: lowConcedeCount / stats.played,
  };
}

/** Average number of days between consecutive matches in `windowMatches`. Null when there are fewer than 2 validly-dated matches to measure a gap from. */
function computeAverageGapDays(windowMatches: MatchSummary[]): number | null {
  const dates = windowMatches
    .map((m) => normalizeMatchDate(m.played_at))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime());
  if (dates.length < 2) return null;

  let totalGapDays = 0;
  for (let i = 0; i < dates.length - 1; i++) {
    totalGapDays += (dates[i]!.getTime() - dates[i + 1]!.getTime()) / 86_400_000;
  }
  return totalGapDays / (dates.length - 1);
}

/**
 * Median days-since-last-match across the whole roster, as of `now` --
 * the baseline calculateActivityScore compares each player against, so a
 * globally quiet league doesn't unfairly penalize every player equally.
 * O(roster * matches); calculateAllPlayerTrends computes this once and
 * reuses it for every player instead of recomputing it per player.
 */
export function computeLeagueMedianDaysSinceLastMatch(roster: MatchSidePlayer[], matches: MatchSummary[], now: Date): number {
  const daysSinceByPlayer: number[] = [];

  for (const player of roster) {
    let mostRecent: Date | null = null;
    for (const match of matches) {
      if (findSides(player.id, match) === null) continue;
      const played = normalizeMatchDate(match.played_at);
      if (played && (!mostRecent || played.getTime() > mostRecent.getTime())) mostRecent = played;
    }
    if (mostRecent) daysSinceByPlayer.push(Math.max(0, (now.getTime() - mostRecent.getTime()) / 86_400_000));
  }

  if (daysSinceByPlayer.length === 0) return 0;
  const sorted = [...daysSinceByPlayer].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export interface MomentumInput {
  recentWinRate: number;
  previousWinRate: number;
  recentGoalDifferencePerMatch: number;
  recentGoalsPerMatch: number;
  currentStreak: { result: SideResult | null; count: number };
}

/**
 * 0-100 "how hot is this player right now" score, weighted from five
 * independently-normalized 0-1 signals:
 *   35% recent win rate (absolute level)
 *   25% win rate trend (recent vs. previous window; 0.5 = no change, 0/1 = a full swing either way)
 *   20% recent goal difference per match (-3..+3 mapped onto 0..1)
 *   10% recent goals per match (0..4 mapped onto 0..1)
 *   10% current streak -- a win streak counts fully, an unbeaten (draw)
 *       streak counts at half weight, a loss streak counts as 0, capped at
 *       a 5-match streak for full credit
 * No opponent-strength term: this app has no Elo or other reliable
 * opponent-rating signal, and Stage 7 explicitly excludes adding one.
 */
export function calculateMomentumScore(input: MomentumInput): number {
  const winRateLevel = clamp(input.recentWinRate, 0, 1);
  const winRateTrend = clamp((input.recentWinRate - input.previousWinRate + 1) / 2, 0, 1);
  const goalDiffSignal = clamp((input.recentGoalDifferencePerMatch + 3) / 6, 0, 1);
  const goalsPerMatchSignal = clamp(input.recentGoalsPerMatch / 4, 0, 1);

  const streakLength = input.currentStreak.result === "loss" ? 0 : input.currentStreak.count;
  const streakWeight = input.currentStreak.result === "draw" ? 0.5 : 1;
  const streakSignal = clamp((streakLength * streakWeight) / 5, 0, 1);

  const score = 100 * (0.35 * winRateLevel + 0.25 * winRateTrend + 0.2 * goalDiffSignal + 0.1 * goalsPerMatchSignal + 0.1 * streakSignal);
  return Math.round(clamp(score, 0, 100));
}

export interface ImprovementInput {
  recentWinRate: number;
  previousWinRate: number;
  recentGoalsPerMatch: number;
  previousGoalsPerMatch: number;
  recentGoalDifferencePerMatch: number;
  previousGoalDifferencePerMatch: number;
  recentLossRate: number;
  previousLossRate: number;
}

/**
 * -100..100 signed change between the previous and recent windows,
 * weighted:
 *   50% win rate change (already -1..1)
 *   20% goals-per-match change (a -3..+3 swing mapped onto -1..1)
 *   20% goal-difference-per-match change (same -3..+3 mapping)
 *   10% loss rate change, inverted (a LOWER loss rate is an improvement)
 * The composite is clamped to -1..1 before scaling to -100..100, so one
 * blowout match/window can't push the score past either end of the scale.
 */
export function calculateImprovementScore(input: ImprovementInput): number {
  const winRateChange = input.recentWinRate - input.previousWinRate;
  const goalsPerMatchChange = clamp((input.recentGoalsPerMatch - input.previousGoalsPerMatch) / 3, -1, 1);
  const goalDifferenceChange = clamp((input.recentGoalDifferencePerMatch - input.previousGoalDifferencePerMatch) / 3, -1, 1);
  const lossRateChange = input.recentLossRate - input.previousLossRate;

  const composite = clamp(0.5 * winRateChange + 0.2 * goalsPerMatchChange + 0.2 * goalDifferenceChange + 0.1 * -lossRateChange, -1, 1);
  return Math.round(composite * 100);
}

const RISING_THRESHOLD = 10;
const FALLING_THRESHOLD = -10;
const STRONG_THRESHOLD = 30;

/** Maps an improvementScore straight to the 4-value TrendDirection -- null means "couldn't compute", i.e. insufficientData. */
export function classifyTrendDirection(improvementScore: number | null): TrendDirection {
  if (improvementScore === null) return "insufficientData";
  if (improvementScore >= RISING_THRESHOLD) return "rising";
  if (improvementScore <= FALLING_THRESHOLD) return "falling";
  return "stable";
}

export type ImprovementMagnitude = "stronglyRising" | "rising" | "stable" | "falling" | "stronglyFalling" | "insufficientData";

/** Finer 5-way (+insufficientData) magnitude used for explanation wording -- classifyTrendDirection's 4-value TrendDirection is what UI state/branching keys off of. */
export function classifyImprovementMagnitude(improvementScore: number | null): ImprovementMagnitude {
  if (improvementScore === null) return "insufficientData";
  if (improvementScore >= STRONG_THRESHOLD) return "stronglyRising";
  if (improvementScore >= RISING_THRESHOLD) return "rising";
  if (improvementScore <= -STRONG_THRESHOLD) return "stronglyFalling";
  if (improvementScore <= FALLING_THRESHOLD) return "falling";
  return "stable";
}

export interface ConsistencyInput {
  /** stats.ts's computeConsistency(...).goalMarginStdDev over the recent window -- reused as-is, not recomputed. */
  goalMarginStdDev: number | null;
  goalsScoredStdDev: number;
  extremeMatchShare: number;
  /** 0-1, e.g. matchesConsidered / (recentWindowSize + previousWindowSize). */
  sampleAdequacy: number;
}

/**
 * 0-100. Higher means steadier results -- NOT better results (a player who
 * always draws 1-1 scores near-maximum here; see Stage 7 M4 spec). Weighted:
 *   45% goal-margin spread (stats.ts's computeConsistency, inverted: 0 stdDev = 1, 4+ = 0)
 *   20% goals-scored spread (same inversion, 0 stdDev = 1, 3+ = 0)
 *   25% share of "extreme" (3+ goal swing) matches, inverted
 *   10% sample adequacy, so a single tiny window doesn't look artificially steady
 * When the window is too small for computeConsistency to return a value,
 * the goal-margin signal defaults to a neutral 0.5 rather than 0 or 1.
 */
export function calculateConsistencyScore(input: ConsistencyInput): number {
  const goalMarginSignal = input.goalMarginStdDev === null ? 0.5 : clamp(1 - input.goalMarginStdDev / 4, 0, 1);
  const goalsScoredSignal = clamp(1 - input.goalsScoredStdDev / 3, 0, 1);
  const extremeSignal = clamp(1 - input.extremeMatchShare, 0, 1);
  const sampleSignal = clamp(input.sampleAdequacy, 0, 1);

  const score = 100 * (0.45 * goalMarginSignal + 0.2 * goalsScoredSignal + 0.25 * extremeSignal + 0.1 * sampleSignal);
  return Math.round(clamp(score, 0, 100));
}

export interface ActivityInput {
  daysSinceLastMatch: number;
  averageDaysBetweenRecentMatches: number | null;
  leagueMedianDaysSinceLastMatch: number;
}

/**
 * 0-100. Weighted:
 *   40% recency RELATIVE to the league's own median dormancy -- only being
 *       more idle than the league norm counts against a player, so a
 *       globally quiet league doesn't drag every player's score down just
 *       because nobody's played this week.
 *   35% cadence: how frequently the recent window's matches are spaced (0 =
 *       averaging 14+ days apart, 1 = daily).
 *   25% absolute recency (0 = 30+ days since last match, 1 = today) as a
 *       floor, so "less idle than everyone else" still requires having
 *       actually played recently.
 */
export function calculateActivityScore(input: ActivityInput): number {
  const relativeIdleDays = Math.max(0, input.daysSinceLastMatch - input.leagueMedianDaysSinceLastMatch);
  const relativeRecencySignal = clamp(1 - relativeIdleDays / 30, 0, 1);
  const cadenceSignal = input.averageDaysBetweenRecentMatches === null ? 0 : clamp(1 - input.averageDaysBetweenRecentMatches / 14, 0, 1);
  const absoluteRecencySignal = clamp(1 - Math.max(0, input.daysSinceLastMatch) / 30, 0, 1);

  const score = 100 * (0.4 * relativeRecencySignal + 0.35 * cadenceSignal + 0.25 * absoluteRecencySignal);
  return Math.round(clamp(score, 0, 100));
}

export interface AttackInput {
  recentGoalsPerMatch: number;
  previousGoalsPerMatch: number;
  totalRecentGoals: number;
  recentWindowSize: number;
  goalsScoredStdDev: number;
}

/**
 * 0-100. Weighted:
 *   45% recent goals per match (0..4 mapped onto 0..1)
 *   25% scoring trend vs. the previous window (a -2..+2 swing mapped onto 0..1)
 *   20% total recent goals relative to a generous 3-per-match ceiling
 *   10% scoring consistency (0 stdDev = 1, 3+ = 0) -- a reliable threat, not one big haul
 */
export function calculateAttackScore(input: AttackInput): number {
  const levelSignal = clamp(input.recentGoalsPerMatch / 4, 0, 1);
  const trendSignal = clamp((input.recentGoalsPerMatch - input.previousGoalsPerMatch + 2) / 4, 0, 1);
  const volumeSignal = input.recentWindowSize === 0 ? 0 : clamp(input.totalRecentGoals / (input.recentWindowSize * 3), 0, 1);
  const consistencySignal = clamp(1 - input.goalsScoredStdDev / 3, 0, 1);

  const score = 100 * (0.45 * levelSignal + 0.25 * trendSignal + 0.2 * volumeSignal + 0.1 * consistencySignal);
  return Math.round(clamp(score, 0, 100));
}

export interface DefenceInput {
  recentGoalsAgainstPerMatch: number;
  recentGoalDifferencePerMatch: number;
  lowConcedingShare: number;
}

/**
 * 0-100. Weighted:
 *   45% goals conceded per match, inverted (0 conceded = 1, 4+ = 0)
 *   30% share of recent matches conceding one or fewer
 *   25% recent goal difference per match (same -3..+3 mapping as momentum's)
 */
export function calculateDefenceScore(input: DefenceInput): number {
  const concededSignal = clamp(1 - input.recentGoalsAgainstPerMatch / 4, 0, 1);
  const lowConcedingSignal = clamp(input.lowConcedingShare, 0, 1);
  const goalDiffSignal = clamp((input.recentGoalDifferencePerMatch + 3) / 6, 0, 1);

  const score = 100 * (0.45 * concededSignal + 0.3 * lowConcedingSignal + 0.25 * goalDiffSignal);
  return Math.round(clamp(score, 0, 100));
}

function insufficientDataTrend(playerId: string, matchesConsidered: number): PlayerTrendMetrics {
  return {
    playerId,
    direction: "insufficientData",
    momentumScore: 0,
    improvementScore: 0,
    consistencyScore: 0,
    activityScore: 0,
    attackScore: 0,
    defenceScore: 0,
    recentWinRate: null,
    previousWinRate: null,
    recentGoalsPerMatch: null,
    previousGoalsPerMatch: null,
    recentGoalDifference: null,
    previousGoalDifference: null,
    currentForm: [],
    matchesConsidered,
    confidence: 0,
  };
}

/**
 * Everything Stage 7 M4 needs for one player: momentum, improvement
 * direction, consistency, activity, attack, and defence, all derived from
 * the same recent/previous match-count windows (selectTrendWindows).
 * `matches` is the WHOLE league's match history (same convention as
 * analytics/playerAnalytics.ts's calculatePlayerAnalytics) so this player's
 * own matches and the league-wide activity baseline can both be derived
 * from one array, without a second fetch.
 */
export function calculatePlayerTrend(
  playerId: string,
  roster: MatchSidePlayer[],
  matches: MatchSummary[],
  now: Date = new Date(),
  options: TrendOptions = {},
): PlayerTrendMetrics {
  const windows = selectTrendWindows(playerId, matches, options);
  if (!windows) {
    const ownMatchCount = matches.filter((m) => findSides(playerId, m) !== null).length;
    return insufficientDataTrend(playerId, ownMatchCount);
  }

  const resolvedOptions = resolveWindowOptions(options);
  const { recent, previous, ordered } = windows;
  const recentStats = buildWindowStats(playerId, recent);
  const previousStats = buildWindowStats(playerId, previous);
  const consistency = computeConsistency(playerId, recent);
  const streaks = computeStreaks(playerId, ordered);

  const momentumScore = calculateMomentumScore({
    recentWinRate: recentStats.winRate,
    previousWinRate: previousStats.winRate,
    recentGoalDifferencePerMatch: recentStats.goalDifferencePerMatch,
    recentGoalsPerMatch: recentStats.goalsPerMatch,
    currentStreak: streaks.currentStreak,
  });

  const improvementScore = calculateImprovementScore({
    recentWinRate: recentStats.winRate,
    previousWinRate: previousStats.winRate,
    recentGoalsPerMatch: recentStats.goalsPerMatch,
    previousGoalsPerMatch: previousStats.goalsPerMatch,
    recentGoalDifferencePerMatch: recentStats.goalDifferencePerMatch,
    previousGoalDifferencePerMatch: previousStats.goalDifferencePerMatch,
    recentLossRate: recentStats.lossRate,
    previousLossRate: previousStats.lossRate,
  });

  const sampleAdequacy = clamp(ordered.length / (resolvedOptions.recentWindowSize + resolvedOptions.previousWindowSize), 0, 1);
  const consistencyScore = calculateConsistencyScore({
    goalMarginStdDev: consistency.goalMarginStdDev,
    goalsScoredStdDev: recentStats.goalsScoredStdDev,
    extremeMatchShare: recentStats.extremeMatchShare,
    sampleAdequacy,
  });

  const lastMatchDate = normalizeMatchDate(ordered[0]!.played_at)!;
  const daysSinceLastMatch = Math.max(0, (now.getTime() - lastMatchDate.getTime()) / 86_400_000);
  const averageDaysBetweenRecentMatches = computeAverageGapDays(recent);
  const leagueMedian = options.leagueMedianDaysSinceLastMatch ?? computeLeagueMedianDaysSinceLastMatch(roster, matches, now);

  const activityScore = calculateActivityScore({
    daysSinceLastMatch,
    averageDaysBetweenRecentMatches,
    leagueMedianDaysSinceLastMatch: leagueMedian,
  });

  const attackScore = calculateAttackScore({
    recentGoalsPerMatch: recentStats.goalsPerMatch,
    previousGoalsPerMatch: previousStats.goalsPerMatch,
    totalRecentGoals: recentStats.goalsScoredTotal,
    recentWindowSize: recent.length,
    goalsScoredStdDev: recentStats.goalsScoredStdDev,
  });

  const defenceScore = calculateDefenceScore({
    recentGoalsAgainstPerMatch: recentStats.goalsAgainstPerMatch,
    recentGoalDifferencePerMatch: recentStats.goalDifferencePerMatch,
    lowConcedingShare: recentStats.lowConcedingShare,
  });

  const currentForm: SideResult[] = recent.map((match) => findSides(playerId, match)!.own.result);

  return {
    playerId,
    direction: classifyTrendDirection(improvementScore),
    momentumScore,
    improvementScore,
    consistencyScore,
    activityScore,
    attackScore,
    defenceScore,
    recentWinRate: recentStats.winRate,
    previousWinRate: previousStats.winRate,
    recentGoalsPerMatch: recentStats.goalsPerMatch,
    previousGoalsPerMatch: previousStats.goalsPerMatch,
    recentGoalDifference: recentStats.goalDifferencePerMatch,
    previousGoalDifference: previousStats.goalDifferencePerMatch,
    currentForm,
    matchesConsidered: ordered.length,
    confidence: Math.round(sampleAdequacy * 100),
  };
}
