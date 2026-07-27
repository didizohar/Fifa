import type { MatchSidePlayer, MatchSummary } from "../matches";
import { computeClubPerformance, computeGoalStats, computeHeadToHead, computeLastNStats, computeMatchTypeSplit, computePlayerStats, computeWinRateRank, findSides } from "../stats";
import { createTimelineBuckets, earliestPlayedDate, filterMatchesByRange, normalizeMatchDate } from "./dateRange";
import type {
  AnalyticsRange,
  ClubUsageStat,
  OpponentPerformance,
  PerformanceTimelineBucket,
  PlayerAnalyticsSummary,
  RecentFormResult,
  TimelinePoint,
} from "./types";

/** Sentinel for calculatePlayerRankTimeline when the player hasn't qualified for the win-rate leaderboard yet (see stats.ts's WIN_RATE_MIN_PLAYED) -- distinguishable from any real 1-indexed rank. */
export const NOT_RANKED = -1;

function toTimelinePoint(bucket: PerformanceTimelineBucket, value: number): TimelinePoint {
  return { bucketStart: bucket.bucketStart, label: bucket.label, value, matchesInBucket: bucket.matches };
}

/**
 * Buckets a player's matches within `range` and tallies wins/losses/draws
 * and goals for/against per bucket, once. Every other calculatePlayer*Timeline
 * function below derives its single metric from this instead of re-scanning
 * match history itself.
 */
export function calculatePlayerPerformanceTimeline(playerId: string, matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): PerformanceTimelineBucket[] {
  const ownMatches = filterMatchesByRange(matches, range, now).filter((m) => findSides(playerId, m) !== null);
  const buckets = createTimelineBuckets(range, now, { earliestDate: earliestPlayedDate(ownMatches) });

  return buckets.map((bucket) => {
    const inBucket = ownMatches.filter((m) => {
      const played = normalizeMatchDate(m.played_at)!;
      return played.getTime() >= bucket.start.getTime() && played.getTime() < bucket.end.getTime();
    });

    let wins = 0;
    let losses = 0;
    let draws = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    for (const match of inBucket) {
      const sides = findSides(playerId, match)!;
      if (sides.own.result === "win") wins++;
      else if (sides.own.result === "loss") losses++;
      else draws++;
      goalsFor += sides.own.score;
      goalsAgainst += sides.opponent.score;
    }

    return { bucketStart: bucket.bucketStart, label: bucket.label, matches: inBucket.length, wins, losses, draws, goalsFor, goalsAgainst };
  });
}

export function calculatePlayerWinRateTimeline(playerId: string, matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  return calculatePlayerPerformanceTimeline(playerId, matches, range, now).map((b) => toTimelinePoint(b, b.matches === 0 ? 0 : b.wins / b.matches));
}

export function calculatePlayerGoalsTimeline(playerId: string, matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  return calculatePlayerPerformanceTimeline(playerId, matches, range, now).map((b) => toTimelinePoint(b, b.goalsFor));
}

export function calculatePlayerMatchesTimeline(playerId: string, matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  return calculatePlayerPerformanceTimeline(playerId, matches, range, now).map((b) => toTimelinePoint(b, b.matches));
}

export function calculatePlayerGoalDifferenceTimeline(playerId: string, matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  return calculatePlayerPerformanceTimeline(playerId, matches, range, now).map((b) => toTimelinePoint(b, b.goalsFor - b.goalsAgainst));
}

/**
 * Rank on the group's win-rate leaderboard (stats.ts's computeWinRateRank)
 * as of the end of each bucket, using the player's full cumulative history
 * up to that point -- not just matches inside `range`, since a career rank
 * shouldn't reset because a chart is zoomed into the last 30 days. Buckets
 * are still scoped to `range` so this timeline lines up with the others.
 */
export function calculatePlayerRankTimeline(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  const ownMatches = filterMatchesByRange(matches, range, now).filter((m) => findSides(playerId, m) !== null);
  const buckets = createTimelineBuckets(range, now, { earliestDate: earliestPlayedDate(ownMatches) });

  return buckets.map((bucket) => {
    const matchesInBucket = ownMatches.filter((m) => {
      const played = normalizeMatchDate(m.played_at)!;
      return played.getTime() >= bucket.start.getTime() && played.getTime() < bucket.end.getTime();
    }).length;

    const upToHere = matches.filter((m) => {
      const played = normalizeMatchDate(m.played_at);
      return played !== null && played.getTime() < bucket.end.getTime();
    });
    const rank = computeWinRateRank(playerId, roster, upToHere);

    return { bucketStart: bucket.bucketStart, label: bucket.label, value: rank ? rank.position : NOT_RANKED, matchesInBucket };
  });
}

/** Thin wrapper over stats.ts's computeLastNStats -- always the player's actual most recent matches, independent of any chart range. */
export function calculatePlayerRecentForm(playerId: string, matches: MatchSummary[], windowSize = 10): RecentFormResult {
  const { stats, form } = computeLastNStats(playerId, matches, windowSize);
  return { windowSize, form, stats };
}

/** playerId's record against every other roster member who they've shared at least one match with, most-played first. */
export function calculateOpponentPerformance(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[]): OpponentPerformance[] {
  return roster
    .filter((opponent) => opponent.id !== playerId)
    .map((opponent) => {
      const h2h = computeHeadToHead(playerId, opponent.id, matches);
      return {
        opponentId: opponent.id,
        opponentName: opponent.display_name,
        played: h2h.played,
        wins: h2h.wins,
        losses: h2h.losses,
        draws: h2h.draws,
        winRate: h2h.winRate,
        goalsFor: h2h.goalsFor,
        goalsAgainst: h2h.goalsAgainst,
        goalDifference: h2h.goalDifference,
      };
    })
    .filter((o) => o.played > 0)
    .sort((a, b) => b.played - a.played);
}

/** playerId's club breakdown (stats.ts's computeClubPerformance) with each club's share of the player's considered matches added. */
export function calculatePlayerClubUsage(playerId: string, matches: MatchSummary[]): ClubUsageStat[] {
  const rows = computeClubPerformance(playerId, matches);
  const totalPlayed = rows.reduce((sum, r) => sum + r.played, 0);
  return rows.map((r) => ({
    clubId: r.clubId,
    clubName: r.clubName,
    matchesPlayed: r.played,
    winRate: r.winRate,
    share: totalPlayed === 0 ? 0 : r.played / totalPlayed,
  }));
}

/** Everything the player analytics screen needs for one player, over one range, in one call. */
export function calculatePlayerAnalytics(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): PlayerAnalyticsSummary {
  const inRange = filterMatchesByRange(matches, range, now);
  const ownInRange = inRange.filter((m) => findSides(playerId, m) !== null);
  const split = computeMatchTypeSplit(playerId, inRange);

  return {
    playerId,
    range,
    matchesConsidered: ownInRange.length,
    overall: computePlayerStats(playerId, inRange),
    singles: split.singles,
    doubles: split.doubles,
    goals: computeGoalStats(playerId, inRange),
    recentForm: calculatePlayerRecentForm(playerId, matches),
    winRateTimeline: calculatePlayerWinRateTimeline(playerId, matches, range, now),
    goalsTimeline: calculatePlayerGoalsTimeline(playerId, matches, range, now),
    matchesTimeline: calculatePlayerMatchesTimeline(playerId, matches, range, now),
    goalDifferenceTimeline: calculatePlayerGoalDifferenceTimeline(playerId, matches, range, now),
    rankTimeline: calculatePlayerRankTimeline(playerId, roster, matches, range, now),
    opponents: calculateOpponentPerformance(playerId, roster, inRange),
    clubUsage: calculatePlayerClubUsage(playerId, inRange),
  };
}
