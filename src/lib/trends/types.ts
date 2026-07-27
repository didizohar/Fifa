import type { SideResult } from "../types/database";

/**
 * "insufficientData" is a first-class direction, not an error -- a player
 * with too little recent history genuinely has no reliable trend to report,
 * and every consumer (dashboard cards, the profile Trends section) must
 * handle it explicitly rather than showing a misleading rising/falling label.
 */
export type TrendDirection = "rising" | "falling" | "stable" | "insufficientData";

export interface PlayerTrendMetrics {
  playerId: string;
  direction: TrendDirection;
  /** 0-100. How "hot" the player is right now -- see playerTrends.ts's calculateMomentumScore for the exact formula. 0 when insufficientData. */
  momentumScore: number;
  /** -100..100. Positive means the recent window is better than the previous one. 0 when insufficientData. */
  improvementScore: number;
  /** 0-100. Higher means steadier results, independent of how good those results are. */
  consistencyScore: number;
  /** 0-100. Recency + cadence of play, relative to the rest of the league. */
  activityScore: number;
  /** 0-100. Recent scoring output. */
  attackScore: number;
  /** 0-100. Recent goals-against performance. */
  defenceScore: number;
  recentWinRate: number | null;
  previousWinRate: number | null;
  recentGoalsPerMatch: number | null;
  previousGoalsPerMatch: number | null;
  /** Average goal difference per match within the window (not a window total) so recent/previous windows of different sizes stay comparable. */
  recentGoalDifference: number | null;
  previousGoalDifference: number | null;
  /** Most recent first, scoped to the recent window only. */
  currentForm: SideResult[];
  /** Total matches spanning both the recent and previous windows. */
  matchesConsidered: number;
  /** 0-100. How much weight this trend deserves, based on sample size -- see TrendWindowOptions. */
  confidence: number;
}

export interface LeagueTrendSummary {
  hotPlayer: PlayerTrendMetrics | null;
  coldPlayer: PlayerTrendMetrics | null;
  biggestImprovement: PlayerTrendMetrics | null;
  biggestDecline: PlayerTrendMetrics | null;
  mostConsistent: PlayerTrendMetrics | null;
  mostActive: PlayerTrendMetrics | null;
  bestAttack: PlayerTrendMetrics | null;
  bestDefence: PlayerTrendMetrics | null;
}

/**
 * Windows are defined by match COUNT, not calendar time, since players in
 * the same league can play at very different frequencies (see playerTrends.ts's
 * selectTrendWindows for the exact fallback/proportional logic below minTotalMatches*2).
 */
export interface TrendWindowOptions {
  recentWindowSize?: number;
  previousWindowSize?: number;
  /** Below this many total (recent + previous) matches, a player's trend is "insufficientData" outright. */
  minTotalMatches?: number;
}

export interface TrendOptions extends TrendWindowOptions {
  /**
   * Median days-since-last-match across the whole roster. Precompute once
   * and pass it in when scoring many players (calculateAllPlayerTrends does
   * this) so every call doesn't re-derive it from the full league history;
   * omit for a one-off single-player call, which derives it itself.
   */
  leagueMedianDaysSinceLastMatch?: number;
}
