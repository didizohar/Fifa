import { classifyImprovementMagnitude } from "./playerTrends";
import type { PlayerTrendMetrics } from "./types";

/** A translation key plus the params to interpolate into it -- the UI calls t(key, params); this module never produces English text directly, so every explanation is localizable the same way M3's chart summaries are. */
export interface TrendExplanation {
  key: string;
  params: Record<string, string | number>;
}

function pct(rate: number | null): number {
  return rate === null ? 0 : Math.round(rate * 100);
}

/** Primary "what's happening" narrative -- rising/falling (with magnitude), stable, or insufficientData. Matches Stage 7 M4's example wording ("Improved from 40% to 70% win rate", "Performance stayed stable across the last 10 matches"). */
export function explainDirection(trend: PlayerTrendMetrics): TrendExplanation {
  if (trend.direction === "insufficientData") return { key: "trends.explanation.insufficientData", params: {} };

  const magnitude = classifyImprovementMagnitude(trend.improvementScore);
  const params = { previous: pct(trend.previousWinRate), recent: pct(trend.recentWinRate), matches: trend.matchesConsidered };

  switch (magnitude) {
    case "stronglyRising":
      return { key: "trends.explanation.stronglyRising", params };
    case "rising":
      return { key: "trends.explanation.rising", params };
    case "stronglyFalling":
      return { key: "trends.explanation.stronglyFalling", params };
    case "falling":
      return { key: "trends.explanation.falling", params };
    default:
      return { key: "trends.explanation.stable", params };
  }
}

/** "Won 4 of the last 5 matches" style momentum framing -- both figures are derived from currentForm, not a separate field. */
export function explainMomentum(trend: PlayerTrendMetrics): TrendExplanation {
  if (trend.direction === "insufficientData") return { key: "trends.explanation.insufficientData", params: {} };
  const wins = trend.currentForm.filter((r) => r === "win").length;
  return { key: "trends.explanation.momentum", params: { wins, matches: trend.currentForm.length } };
}

const CONSISTENCY_HIGH = 70;
const CONSISTENCY_MEDIUM = 40;

export function explainConsistency(trend: PlayerTrendMetrics): TrendExplanation {
  if (trend.direction === "insufficientData") return { key: "trends.explanation.insufficientData", params: {} };
  const params = { matches: trend.matchesConsidered };
  if (trend.consistencyScore >= CONSISTENCY_HIGH) return { key: "trends.explanation.consistencyHigh", params };
  if (trend.consistencyScore >= CONSISTENCY_MEDIUM) return { key: "trends.explanation.consistencyMedium", params };
  return { key: "trends.explanation.consistencyLow", params };
}

const ACTIVITY_HIGH = 50;

export function explainActivity(trend: PlayerTrendMetrics): TrendExplanation {
  if (trend.direction === "insufficientData") return { key: "trends.explanation.insufficientData", params: {} };
  const params = { matches: trend.matchesConsidered };
  return trend.activityScore >= ACTIVITY_HIGH ? { key: "trends.explanation.activityHigh", params } : { key: "trends.explanation.activityLow", params };
}

/** "Scored 11 goals in the last 5 matches" when scoring held up or improved; "fewer goals than the previous period" when it dropped. */
export function explainAttack(trend: PlayerTrendMetrics): TrendExplanation {
  if (trend.direction === "insufficientData" || trend.recentGoalsPerMatch === null) return { key: "trends.explanation.insufficientData", params: {} };
  if (trend.previousGoalsPerMatch !== null && trend.recentGoalsPerMatch < trend.previousGoalsPerMatch) {
    return { key: "trends.explanation.attackWeak", params: {} };
  }
  const goals = Math.round(trend.recentGoalsPerMatch * trend.currentForm.length);
  return { key: "trends.explanation.attackStrong", params: { goals, matches: trend.currentForm.length } };
}

const DEFENCE_STRONG = 60;

export function explainDefence(trend: PlayerTrendMetrics): TrendExplanation {
  if (trend.direction === "insufficientData") return { key: "trends.explanation.insufficientData", params: {} };
  const params = { matches: trend.matchesConsidered };
  return trend.defenceScore >= DEFENCE_STRONG ? { key: "trends.explanation.defenceStrong", params } : { key: "trends.explanation.defenceWeak", params };
}
