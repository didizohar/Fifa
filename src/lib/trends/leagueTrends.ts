import type { MatchSidePlayer, MatchSummary } from "../matches";
import { calculatePlayerTrend, computeLeagueMedianDaysSinceLastMatch } from "./playerTrends";
import type { LeagueTrendSummary, PlayerTrendMetrics, TrendOptions } from "./types";

/**
 * Every roster member's trend, in roster order. The league-median activity
 * baseline (computeLeagueMedianDaysSinceLastMatch) is computed once here and
 * reused for every player, instead of each calculatePlayerTrend call
 * re-deriving it from the full league history on its own.
 *
 * Archived/deleted players aren't filtered here -- exactly which players
 * show up depends entirely on the roster the caller passes in (e.g. Home's
 * default usePlayers(groupId) already excludes archived/deleted players,
 * matching the app's existing historical rules; a caller that wants
 * archived players included can pass includeArchived roster data instead).
 */
export function calculateAllPlayerTrends(roster: MatchSidePlayer[], matches: MatchSummary[], now: Date = new Date(), options: TrendOptions = {}): PlayerTrendMetrics[] {
  const leagueMedianDaysSinceLastMatch = options.leagueMedianDaysSinceLastMatch ?? computeLeagueMedianDaysSinceLastMatch(roster, matches, now);
  return roster.map((player) => calculatePlayerTrend(player.id, roster, matches, now, { ...options, leagueMedianDaysSinceLastMatch }));
}

/**
 * Picks the trend with the highest (or, with direction "min", lowest) score.
 * Ties break deterministically -- more matches considered wins, then lowest
 * playerId -- the same "no randomness, always the same answer for the same
 * input" spirit as stats.ts's leaderboard tie-breaks. Players with
 * "insufficientData" are never picked (Stage 7 M4: don't surface cards
 * without enough data to back them).
 */
function pickBest(trends: PlayerTrendMetrics[], scoreOf: (trend: PlayerTrendMetrics) => number, direction: "max" | "min" = "max"): PlayerTrendMetrics | null {
  const eligible = trends.filter((t) => t.direction !== "insufficientData");
  if (eligible.length === 0) return null;

  return eligible.reduce((best, candidate) => {
    const bestScore = scoreOf(best);
    const candidateScore = scoreOf(candidate);
    if (candidateScore === bestScore) {
      if (candidate.matchesConsidered !== best.matchesConsidered) return candidate.matchesConsidered > best.matchesConsidered ? candidate : best;
      return candidate.playerId < best.playerId ? candidate : best;
    }
    const candidateIsBetter = direction === "max" ? candidateScore > bestScore : candidateScore < bestScore;
    return candidateIsBetter ? candidate : best;
  });
}

/** One league-wide snapshot: the standout player for each trend dimension, or null where nobody currently qualifies. */
export function calculateLeagueTrendSummary(roster: MatchSidePlayer[], matches: MatchSummary[], now: Date = new Date(), options: TrendOptions = {}): LeagueTrendSummary {
  const leagueMedianDaysSinceLastMatch = options.leagueMedianDaysSinceLastMatch ?? computeLeagueMedianDaysSinceLastMatch(roster, matches, now);
  const trends = calculateAllPlayerTrends(roster, matches, now, { ...options, leagueMedianDaysSinceLastMatch });

  return {
    hotPlayer: pickBest(trends, (t) => t.momentumScore),
    coldPlayer: pickBest(trends, (t) => t.momentumScore, "min"),
    biggestImprovement: pickBest(trends, (t) => t.improvementScore),
    biggestDecline: pickBest(trends, (t) => t.improvementScore, "min"),
    mostConsistent: pickBest(trends, (t) => t.consistencyScore),
    mostActive: pickBest(trends, (t) => t.activityScore),
    bestAttack: pickBest(trends, (t) => t.attackScore),
    bestDefence: pickBest(trends, (t) => t.defenceScore),
  };
}
