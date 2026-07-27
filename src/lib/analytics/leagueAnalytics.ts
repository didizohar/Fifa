import type { MatchSidePlayer, MatchSummary } from "../matches";
import { computePlayerStats } from "../stats";
import { createTimelineBuckets, earliestPlayedDate, filterMatchesByRange, groupByBucket, normalizeMatchDate, toTimelinePoint } from "./dateRange";
import { calculatePlayerWinRateTimeline } from "./playerAnalytics";
import type {
  AnalyticsRange,
  ClubUsageStat,
  HourlyActivityRow,
  LeagueAnalyticsSummary,
  MonthlyActivityRow,
  ParticipationRow,
  TimelinePoint,
  TopScorerTimelinePoint,
  WeekdayActivityRow,
  WinRateEvolutionRow,
} from "./types";

interface LeagueTimelineBucket {
  bucketStart: string;
  label: string;
  matches: number;
  totalGoals: number;
  totalAbsGoalDiff: number;
}

/**
 * Buckets every match in `range` and tallies match count, total goals, and
 * total absolute goal margin per bucket, once. The four league *Timeline
 * functions below each derive their single metric from this instead of
 * re-scanning match history themselves.
 */
function buildLeagueTimelineBuckets(matches: MatchSummary[], range: AnalyticsRange, now: Date): LeagueTimelineBucket[] {
  const inRange = filterMatchesByRange(matches, range, now);
  const buckets = createTimelineBuckets(range, now, { earliestDate: earliestPlayedDate(inRange) });
  const grouped = groupByBucket(inRange, buckets, (m) => normalizeMatchDate(m.played_at));

  return buckets.map((bucket, i) => {
    let totalGoals = 0;
    let totalAbsGoalDiff = 0;
    for (const match of grouped[i]!) {
      totalGoals += match.sides[0].score + match.sides[1].score;
      totalAbsGoalDiff += Math.abs(match.sides[0].score - match.sides[1].score);
    }

    return { bucketStart: bucket.bucketStart, label: bucket.label, matches: grouped[i]!.length, totalGoals, totalAbsGoalDiff };
  });
}

export function calculateMatchesTimeline(matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  return buildLeagueTimelineBuckets(matches, range, now).map((b) => toTimelinePoint(b, b.matches));
}

export function calculateGoalsTimeline(matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  return buildLeagueTimelineBuckets(matches, range, now).map((b) => toTimelinePoint(b, b.totalGoals));
}

export function calculateAverageScoreTimeline(matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  return buildLeagueTimelineBuckets(matches, range, now).map((b) => toTimelinePoint(b, b.matches === 0 ? 0 : b.totalGoals / b.matches));
}

/** Average absolute goal margin per match, per bucket -- a proxy for how one-sided matches were, not the (often near-zero) signed average. */
export function calculateAverageGoalDifferenceTimeline(matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TimelinePoint[] {
  return buildLeagueTimelineBuckets(matches, range, now).map((b) => toTimelinePoint(b, b.matches === 0 ? 0 : b.totalAbsGoalDiff / b.matches));
}

/** How many of `range`'s matches each roster member took part in, most-active first. Reuses stats.ts's computePlayerStats rather than re-deriving played counts. */
export function calculatePlayerParticipation(roster: MatchSidePlayer[], matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): ParticipationRow[] {
  const inRange = filterMatchesByRange(matches, range, now);
  const totalMatches = inRange.length;

  return roster
    .map((p) => {
      const matchesPlayed = computePlayerStats(p.id, inRange).played;
      return { playerId: p.id, playerName: p.display_name, matchesPlayed, share: totalMatches === 0 ? 0 : matchesPlayed / totalMatches };
    })
    .sort((a, b) => b.matchesPlayed - a.matchesPlayed);
}

/**
 * League-wide club usage: how many side-appearances each club had within
 * `range`, and how often the side using it won. Counts appearances rather
 * than distinct matches, since both sides of a match can (rarely) use the
 * same club.
 */
export function calculateClubPopularity(matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): ClubUsageStat[] {
  const inRange = filterMatchesByRange(matches, range, now);
  const byClub = new Map<string, { name: string; matchesPlayed: number; wins: number }>();
  let totalAppearances = 0;

  for (const match of inRange) {
    for (const side of match.sides) {
      if (!side.club) continue;
      totalAppearances++;
      const entry = byClub.get(side.club.id) ?? { name: side.club.name, matchesPlayed: 0, wins: 0 };
      entry.matchesPlayed++;
      if (side.result === "win") entry.wins++;
      byClub.set(side.club.id, entry);
    }
  }

  return [...byClub.entries()]
    .map(([clubId, e]) => ({
      clubId,
      clubName: e.name,
      matchesPlayed: e.matchesPlayed,
      winRate: e.matchesPlayed === 0 ? null : e.wins / e.matchesPlayed,
      share: totalAppearances === 0 ? 0 : e.matchesPlayed / totalAppearances,
    }))
    .sort((a, b) => b.matchesPlayed - a.matchesPlayed);
}

export function calculateWeekdayActivity(matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): WeekdayActivityRow[] {
  const inRange = filterMatchesByRange(matches, range, now);
  const counts = new Array(7).fill(0) as number[];
  for (const m of inRange) {
    const played = normalizeMatchDate(m.played_at);
    if (played) counts[played.getDay()]++;
  }
  const total = inRange.length;
  return counts.map((count, day) => ({ day, matches: count, share: total === 0 ? 0 : count / total }));
}

export function calculateHourlyActivity(matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): HourlyActivityRow[] {
  const inRange = filterMatchesByRange(matches, range, now);
  const counts = new Array(24).fill(0) as number[];
  for (const m of inRange) {
    const played = normalizeMatchDate(m.played_at);
    if (played) counts[played.getHours()]++;
  }
  const total = inRange.length;
  return counts.map((count, hour) => ({ hour, matches: count, share: total === 0 ? 0 : count / total }));
}

/** Match count and total goals per calendar month within `range`, oldest first. Only months with at least one match appear. */
export function calculateMonthlyActivity(matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): MonthlyActivityRow[] {
  const inRange = filterMatchesByRange(matches, range, now);
  const byMonth = new Map<string, MonthlyActivityRow>();

  for (const match of inRange) {
    const played = normalizeMatchDate(match.played_at);
    if (!played) continue;
    const key = `${played.getFullYear()}-${played.getMonth()}`;
    const entry = byMonth.get(key) ?? { year: played.getFullYear(), month: played.getMonth(), matches: 0, totalGoals: 0 };
    entry.matches++;
    entry.totalGoals += match.sides[0].score + match.sides[1].score;
    byMonth.set(key, entry);
  }

  return [...byMonth.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}

/**
 * The single-highest goal-scorer per bucket, sourced from the match data's
 * own embedded player names -- not the live roster -- so an archived or
 * deleted player who scored still shows up correctly for past buckets.
 * Null fields mean nobody scored in that bucket.
 */
export function calculateTopScorersTimeline(matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): TopScorerTimelinePoint[] {
  const inRange = filterMatchesByRange(matches, range, now);
  const buckets = createTimelineBuckets(range, now, { earliestDate: earliestPlayedDate(inRange) });
  const grouped = groupByBucket(inRange, buckets, (m) => normalizeMatchDate(m.played_at));

  return buckets.map((bucket, i) => {
    const goalsByPlayer = new Map<string, { name: string; goals: number }>();
    for (const match of grouped[i]!) {
      for (const side of match.sides) {
        for (const player of side.players) {
          const entry = goalsByPlayer.get(player.id) ?? { name: player.display_name, goals: 0 };
          entry.goals += side.score;
          goalsByPlayer.set(player.id, entry);
        }
      }
    }

    let top: { id: string; name: string; goals: number } | null = null;
    for (const [id, entry] of goalsByPlayer) {
      if (!top || entry.goals > top.goals) top = { id, name: entry.name, goals: entry.goals };
    }

    return { bucketStart: bucket.bucketStart, label: bucket.label, playerId: top?.id ?? null, playerName: top?.name ?? null, goals: top?.goals ?? 0 };
  });
}

/** Each roster member's win-rate timeline (playerAnalytics.ts's calculatePlayerWinRateTimeline) side by side, omitting anyone with zero matches in `range`. */
export function calculateWinRateEvolution(roster: MatchSidePlayer[], matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): WinRateEvolutionRow[] {
  return roster
    .map((p) => ({ playerId: p.id, playerName: p.display_name, timeline: calculatePlayerWinRateTimeline(p.id, matches, range, now) }))
    .filter((row) => row.timeline.some((point) => point.matchesInBucket > 0));
}

/** Everything the league analytics screen needs for one range, in one call. */
export function calculateLeagueAnalytics(roster: MatchSidePlayer[], matches: MatchSummary[], range: AnalyticsRange, now: Date = new Date()): LeagueAnalyticsSummary {
  const inRange = filterMatchesByRange(matches, range, now);
  const totalGoals = inRange.reduce((sum, m) => sum + m.sides[0].score + m.sides[1].score, 0);

  return {
    range,
    matchesConsidered: inRange.length,
    playersCount: roster.length,
    totalGoals,
    matchesTimeline: calculateMatchesTimeline(matches, range, now),
    goalsTimeline: calculateGoalsTimeline(matches, range, now),
    averageScoreTimeline: calculateAverageScoreTimeline(matches, range, now),
    averageGoalDifferenceTimeline: calculateAverageGoalDifferenceTimeline(matches, range, now),
    playerParticipation: calculatePlayerParticipation(roster, matches, range, now),
    clubPopularity: calculateClubPopularity(matches, range, now),
    weekdayActivity: calculateWeekdayActivity(matches, range, now),
    hourlyActivity: calculateHourlyActivity(matches, range, now),
    monthlyActivity: calculateMonthlyActivity(matches, range, now),
    topScorersTimeline: calculateTopScorersTimeline(matches, range, now),
    winRateEvolution: calculateWinRateEvolution(roster, matches, range, now),
  };
}
