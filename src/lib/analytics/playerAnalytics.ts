import type { MatchSidePlayer, MatchSummary } from "../matches";
import { computeClubPerformance, computeGoalStats, computeHeadToHead, computeLastNStats, computeMatchTypeSplit, computePlayerStats, computeWinRateRank, findSides } from "../stats";
import { createTimelineBuckets, earliestPlayedDate, filterMatchesByRange, groupByBucket, normalizeMatchDate, toTimelinePoint, type TimelineBucket } from "./dateRange";
import type { AnalyticsRange, ClubUsageStat, OpponentPerformance, PerformanceTimelineBucket, PlayerAnalyticsSummary, RecentFormResult, TimelinePoint } from "./types";

/** Sentinel for calculatePlayerRankTimeline when the player hasn't qualified for the win-rate leaderboard yet (see stats.ts's WIN_RATE_MIN_PLAYED) -- distinguishable from any real 1-indexed rank. */
export const NOT_RANKED = -1;

/** Shared by calculatePlayerPerformanceTimeline and calculatePlayerRankTimeline -- both need the same "this player's in-range matches, bucketed over the same span" starting point. */
function ownMatchesAndBuckets(playerId: string, matches: MatchSummary[], range: AnalyticsRange, now: Date): { ownMatches: MatchSummary[]; buckets: TimelineBucket[] } {
  const ownMatches = filterMatchesByRange(matches, range, now).filter((m) => findSides(playerId, m) !== null);
  const buckets = createTimelineBuckets(range, now, { earliestDate: earliestPlayedDate(ownMatches) });
  return { ownMatches, buckets };
}

/**
 * Buckets a player's matches within `range` and tallies wins/losses/draws
 * and goals for/against per bucket, once. Every other calculatePlayer*Timeline
 * function below derives its single metric from this instead of re-scanning
 * match history itself.
 */
export function calculatePlayerPerformanceTimeline(playerId: string, matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): PerformanceTimelineBucket[] {
  const { ownMatches, buckets } = ownMatchesAndBuckets(playerId, matches, range, now);
  const grouped = groupByBucket(ownMatches, buckets, (m) => normalizeMatchDate(m.played_at));

  return buckets.map((bucket, i) => {
    const inBucket = grouped[i]!;
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
 *
 * Builds the cumulative "history so far" with a single sorted pass (a
 * pointer that only ever advances) instead of re-filtering the entire
 * match history once per bucket.
 */
export function calculatePlayerRankTimeline(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  const { ownMatches, buckets } = ownMatchesAndBuckets(playerId, matches, range, now);
  const grouped = groupByBucket(ownMatches, buckets, (m) => normalizeMatchDate(m.played_at));

  const sortedByDate = matches
    .map((m) => ({ match: m, date: normalizeMatchDate(m.played_at) }))
    .filter((r): r is { match: MatchSummary; date: Date } => r.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const cumulative: MatchSummary[] = [];
  let cursor = 0;

  return buckets.map((bucket, i) => {
    while (cursor < sortedByDate.length && sortedByDate[cursor]!.date.getTime() < bucket.end.getTime()) {
      cumulative.push(sortedByDate[cursor]!.match);
      cursor++;
    }
    const rank = computeWinRateRank(playerId, roster, cumulative);
    return { bucketStart: bucket.bucketStart, label: bucket.label, value: rank ? rank.position : NOT_RANKED, matchesInBucket: grouped[i]!.length };
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

/** playerId's club breakdown (stats.ts's computeClubPerformance) with each club's share of the player's considered matches, and goals for/against, added. */
export function calculatePlayerClubUsage(playerId: string, matches: MatchSummary[]): ClubUsageStat[] {
  const rows = computeClubPerformance(playerId, matches);
  const totalPlayed = rows.reduce((sum, r) => sum + r.played, 0);

  const goalsByClub = new Map<string, { goalsFor: number; goalsAgainst: number }>();
  for (const match of matches) {
    const sides = findSides(playerId, match);
    if (!sides?.own.club) continue;
    const entry = goalsByClub.get(sides.own.club.id) ?? { goalsFor: 0, goalsAgainst: 0 };
    entry.goalsFor += sides.own.score;
    entry.goalsAgainst += sides.opponent.score;
    goalsByClub.set(sides.own.club.id, entry);
  }

  return rows.map((r) => ({
    clubId: r.clubId,
    clubName: r.clubName,
    matchesPlayed: r.played,
    winRate: r.winRate,
    share: totalPlayed === 0 ? 0 : r.played / totalPlayed,
    goalsFor: goalsByClub.get(r.clubId)?.goalsFor ?? 0,
    goalsAgainst: goalsByClub.get(r.clubId)?.goalsAgainst ?? 0,
  }));
}

/** Everything the player analytics screen needs for one player, over one range, in one call. */
export function calculatePlayerAnalytics(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): PlayerAnalyticsSummary {
  const inRange = filterMatchesByRange(matches, range, now);
  const overall = computePlayerStats(playerId, inRange);
  const split = computeMatchTypeSplit(playerId, inRange);

  // Computed once and reused for every derived *Timeline below (same values
  // calculatePlayerWinRateTimeline/GoalsTimeline/MatchesTimeline/GoalDifferenceTimeline
  // each produce standalone) -- avoids bucketing this player's whole history four times over.
  const performanceTimeline = calculatePlayerPerformanceTimeline(playerId, matches, range, now);

  return {
    playerId,
    range,
    // computePlayerStats already scans inRange for this player's matches --
    // reuse its count instead of a second full-array filter pass just for the total.
    matchesConsidered: overall.played,
    overall,
    singles: split.singles,
    doubles: split.doubles,
    goals: computeGoalStats(playerId, inRange),
    recentForm: calculatePlayerRecentForm(playerId, matches),
    winRateTimeline: performanceTimeline.map((b) => toTimelinePoint(b, b.matches === 0 ? 0 : b.wins / b.matches)),
    goalsTimeline: performanceTimeline.map((b) => toTimelinePoint(b, b.goalsFor)),
    matchesTimeline: performanceTimeline.map((b) => toTimelinePoint(b, b.matches)),
    goalDifferenceTimeline: performanceTimeline.map((b) => toTimelinePoint(b, b.goalsFor - b.goalsAgainst)),
    rankTimeline: calculatePlayerRankTimeline(playerId, roster, matches, range, now),
    performanceTimeline,
    opponents: calculateOpponentPerformance(playerId, roster, inRange),
    clubUsage: calculatePlayerClubUsage(playerId, inRange),
  };
}
