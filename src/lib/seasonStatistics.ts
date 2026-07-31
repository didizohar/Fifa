import {
  calculateClubPopularity,
  calculateGoalsTimeline,
  calculateMatchesTimeline,
  calculateWinRateEvolution,
} from "./analytics/leagueAnalytics";
import type { ClubUsageStat, TimelinePoint, WinRateEvolutionRow } from "./analytics/types";
import { computeGoalsScoredLeaderboard, type LeaderboardRow } from "./stats";
import type { MatchSidePlayer, MatchSummary } from "./matches";
import type { Season } from "./types/database";

export interface SeasonStatistics {
  matchesOverTime: TimelinePoint[];
  goalsOverTime: TimelinePoint[];
  winRateTrend: WinRateEvolutionRow[];
  goalsPerPlayer: LeaderboardRow[];
  clubUsage: ClubUsageStat[];
}

/**
 * The season's `end_date` (or `now` for the still-active season) anchors
 * every reused analytics timeline function's *last* bucket -- calling
 * calculateMatchesTimeline etc. with today's real date for an archived
 * season would otherwise pad the chart with meaningless empty buckets
 * between the season's actual end and today. Passing range="all" plus this
 * anchor is what makes range-relative timeline functions (built for
 * "last 7d/30d/90d/1y" of *live* data) correct for an arbitrary historical
 * window instead.
 */
function seasonEndAsNow(season: Season, now: Date): Date {
  return season.end_date ? new Date(season.end_date) : now;
}

/**
 * Every "Statistics" tab dataset for a season, built entirely by reusing
 * the existing league analytics engine (leagueAnalytics.ts) and stats.ts's
 * leaderboards -- no season-specific chart math needed beyond anchoring
 * `now` at the season's end. `seasonMatches` must already be filtered to
 * the season's window (see matchesInSeasonWindow in seasonReport.ts).
 */
export function computeSeasonStatistics(season: Season, roster: MatchSidePlayer[], seasonMatches: MatchSummary[], now: Date = new Date()): SeasonStatistics {
  const anchor = seasonEndAsNow(season, now);
  return {
    matchesOverTime: calculateMatchesTimeline(seasonMatches, "all", anchor),
    goalsOverTime: calculateGoalsTimeline(seasonMatches, "all", anchor),
    winRateTrend: calculateWinRateEvolution(roster, seasonMatches, "all", anchor),
    goalsPerPlayer: computeGoalsScoredLeaderboard(roster, seasonMatches),
    clubUsage: calculateClubPopularity(seasonMatches, "all", anchor),
  };
}

export interface SeasonClubRankings {
  mostUsed: ClubUsageStat[];
  highestWinRate: ClubUsageStat[];
  highestScoring: ClubUsageStat[];
  /** Every club used this season, sorted by matches played -- the same list calculateClubPopularity returns, named for the "Club Rankings" table specifically. */
  allClubs: ClubUsageStat[];
}

/** Three re-sorted views of the same season club-usage data -- "Most Used", "Highest Win Rate", and "Highest Scoring" are different orderings of one dataset, not three separate computations. Clubs with too few appearances aren't excluded from winRate ranking here (unlike a player leaderboard) since a season's club pool is naturally small and every appearance is real usage, not a noisy sample. */
export function computeSeasonClubRankings(clubUsage: ClubUsageStat[]): SeasonClubRankings {
  return {
    mostUsed: [...clubUsage].sort((a, b) => b.matchesPlayed - a.matchesPlayed),
    highestWinRate: [...clubUsage].sort((a, b) => (b.winRate ?? -1) - (a.winRate ?? -1)),
    highestScoring: [...clubUsage].sort((a, b) => b.goalsFor - a.goalsFor),
    allClubs: [...clubUsage].sort((a, b) => b.matchesPlayed - a.matchesPlayed),
  };
}
