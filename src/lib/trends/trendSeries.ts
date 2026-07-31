import { computeLeaguePoints } from "../leagueStandings";
import type { MatchSidePlayer, MatchSummary } from "../matches";
import { calculatePlayerPerformanceTimeline } from "../analytics/playerAnalytics";
import { toTimelinePoint } from "../analytics/dateRange";
import type { AnalyticsRange, TimelinePoint } from "../analytics/types";

/** Every metric selectable on the Trends Over Time chart. */
export type TrendMetricKey = "winRate" | "wins" | "goalsPerMatch" | "goalDifference" | "matchesPlayed" | "leaguePoints";

export const TREND_METRIC_KEYS: TrendMetricKey[] = ["winRate", "wins", "goalsPerMatch", "goalDifference", "matchesPlayed", "leaguePoints"];

export function calculatePlayerWinsTimeline(playerId: string, matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  return calculatePlayerPerformanceTimeline(playerId, matches, range, now).map((b) => toTimelinePoint(b, b.wins));
}

export function calculatePlayerGoalsPerMatchTimeline(playerId: string, matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  return calculatePlayerPerformanceTimeline(playerId, matches, range, now).map((b) => toTimelinePoint(b, b.matches === 0 ? 0 : b.goalsFor / b.matches));
}

/** League points (win=3, draw=1, loss=0) earned per bucket -- not cumulative, matches the other per-bucket trend metrics. */
export function calculatePlayerPointsTimeline(playerId: string, matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  return calculatePlayerPerformanceTimeline(playerId, matches, range, now).map((b) => toTimelinePoint(b, computeLeaguePoints(b.wins, b.draws)));
}

/**
 * Dispatches to the right per-metric timeline function -- one entry point
 * the Trends screen can call without a switch of its own. All six reuse
 * calculatePlayerPerformanceTimeline's single bucketing pass under the hood
 * (via the individual functions above, or playerAnalytics.ts's existing
 * win-rate/goals/matches/goal-difference timelines).
 */
export function calculatePlayerTrendMetricTimeline(
  metric: TrendMetricKey,
  playerId: string,
  matches: MatchSummary[],
  range: AnalyticsRange,
  now: Date = new Date(),
): TimelinePoint[] {
  const buckets = calculatePlayerPerformanceTimeline(playerId, matches, range, now);
  switch (metric) {
    case "winRate":
      return buckets.map((b) => toTimelinePoint(b, b.matches === 0 ? 0 : b.wins / b.matches));
    case "wins":
      return buckets.map((b) => toTimelinePoint(b, b.wins));
    case "goalsPerMatch":
      return buckets.map((b) => toTimelinePoint(b, b.matches === 0 ? 0 : b.goalsFor / b.matches));
    case "goalDifference":
      return buckets.map((b) => toTimelinePoint(b, b.goalsFor - b.goalsAgainst));
    case "matchesPlayed":
      return buckets.map((b) => toTimelinePoint(b, b.matches));
    case "leaguePoints":
      return buckets.map((b) => toTimelinePoint(b, computeLeaguePoints(b.wins, b.draws)));
  }
}

export interface TrendSeries {
  playerId: string;
  playerName: string;
  points: TimelinePoint[];
}

/**
 * One named timeline per selected player, for the given metric/range --
 * the Trends screen's "select one or more players" data source. Omits a
 * player entirely if they have zero matches anywhere in the bucketed span,
 * so an empty series never renders as a flat zero line.
 */
export function calculateTrendSeriesForPlayers(
  metric: TrendMetricKey,
  players: readonly MatchSidePlayer[],
  matches: MatchSummary[],
  range: AnalyticsRange,
  now: Date = new Date(),
): TrendSeries[] {
  return players
    .map((player) => ({
      playerId: player.id,
      playerName: player.display_name,
      points: calculatePlayerTrendMetricTimeline(metric, player.id, matches, range, now),
    }))
    .filter((series) => series.points.some((p) => p.matchesInBucket > 0));
}
