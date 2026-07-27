import { normalizeMatchDate } from "./analytics/dateRange";
import type { AnalyticsRange, OpponentPerformance, TimelinePoint } from "./analytics/types";
import type { MatchSummary } from "./matches";
import { findSides, MIN_SAMPLE_SIZE, type FormEntry } from "./stats";

/** Every range the player analytics UI offers, in display order, paired with its translation key. */
export const ANALYTICS_RANGE_OPTIONS: { value: AnalyticsRange; labelKey: string }[] = [
  { value: "7d", labelKey: "playerAnalytics.range7d" },
  { value: "30d", labelKey: "playerAnalytics.range30d" },
  { value: "90d", labelKey: "playerAnalytics.range90d" },
  { value: "1y", labelKey: "playerAnalytics.range1y" },
  { value: "all", labelKey: "playerAnalytics.rangeAll" },
];

/**
 * Which of `count` points should carry a visible x-axis label, evenly
 * spread (always including the first and last) so a 30-point timeline
 * doesn't render 30 overlapping labels.
 */
export function selectTimelineAxisLabelIndices(count: number, maxLabels = 5): number[] {
  if (count <= 0) return [];
  if (count <= maxLabels) return Array.from({ length: count }, (_, i) => i);

  const indices = new Set<number>([0, count - 1]);
  const steps = maxLabels - 1;
  for (let i = 1; i < steps; i++) {
    indices.add(Math.round((i * (count - 1)) / steps));
  }
  return [...indices].sort((a, b) => a - b);
}

export interface TimelineTrendSummary {
  first: TimelinePoint;
  last: TimelinePoint;
  min: number;
  max: number;
}

/** Ignores buckets with no matches -- an explicit zero-value bucket still counts as "no data" for trend purposes, not a real low point. Null when every bucket is empty. */
export function summarizeTimelineTrend(points: TimelinePoint[]): TimelineTrendSummary | null {
  const withData = points.filter((p) => p.matchesInBucket > 0);
  if (withData.length === 0) return null;

  const values = withData.map((p) => p.value);
  return { first: withData[0]!, last: withData[withData.length - 1]!, min: Math.min(...values), max: Math.max(...values) };
}

export interface FormOutcomeCounts {
  wins: number;
  draws: number;
  losses: number;
}

export function countFormOutcomes(form: FormEntry[]): FormOutcomeCounts {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const entry of form) {
    if (entry.result === "win") wins++;
    else if (entry.result === "draw") draws++;
    else losses++;
  }
  return { wins, draws, losses };
}

/**
 * UI-only 3/1/0 weighting for a compact "recent form" summary number --
 * deliberately separate from Elo and from the win-rate leaderboard ranking,
 * never used to rank or qualify players.
 */
export function computeFormScore(form: FormEntry[]): number {
  const { wins, draws } = countFormOutcomes(form);
  return wins * 3 + draws;
}

export type OpponentSortMode = "mostPlayed" | "bestWinRate" | "worstMatchup" | "goalDifference";

export const OPPONENT_SORT_MODES: OpponentSortMode[] = ["mostPlayed", "bestWinRate", "worstMatchup", "goalDifference"];

/** Re-sorts an already-computed OpponentPerformance[] (playerAnalytics.ts's calculateOpponentPerformance) -- no stats are recalculated here. */
export function sortOpponentPerformance(rows: OpponentPerformance[], sortMode: OpponentSortMode): OpponentPerformance[] {
  const sorted = [...rows];
  switch (sortMode) {
    case "mostPlayed":
      return sorted.sort((a, b) => b.played - a.played);
    case "bestWinRate":
      return sorted.sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.played - a.played);
    case "worstMatchup":
      return sorted.sort((a, b) => (a.winRate ?? 0) - (b.winRate ?? 0) || b.played - a.played);
    case "goalDifference":
      return sorted.sort((a, b) => b.goalDifference - a.goalDifference);
    default:
      return sorted;
  }
}

export type PlayerAnalyticsNotice = "archivedPlayer" | "noMatches" | "oneMatchOnly" | "insufficientSample" | "legacyDataExcluded";

/**
 * Every notice banner the analytics tab should show, most important first.
 * Pure decision logic only -- the calling screen owns rendering and
 * translation.
 */
export function resolvePlayerAnalyticsNotices(params: { matchesConsidered: number; isArchived: boolean; hasUnparseableDates: boolean }): PlayerAnalyticsNotice[] {
  const notices: PlayerAnalyticsNotice[] = [];
  if (params.isArchived) notices.push("archivedPlayer");

  if (params.matchesConsidered === 0) notices.push("noMatches");
  else if (params.matchesConsidered === 1) notices.push("oneMatchOnly");
  else if (params.matchesConsidered < MIN_SAMPLE_SIZE) notices.push("insufficientSample");

  if (params.hasUnparseableDates) notices.push("legacyDataExcluded");
  return notices;
}

/** True if any of this player's matches has a played_at the analytics engine can't parse (dropped from every calculation, per analytics/dateRange.ts's normalizeMatchDate) -- surfaced as a "legacy data" notice instead of silently vanishing. */
export function hasUnparseableOwnMatchDates(playerId: string, matches: MatchSummary[]): boolean {
  return matches.some((m) => findSides(playerId, m) !== null && normalizeMatchDate(m.played_at) === null);
}
