import type { MatchSidePlayer, MatchSummary } from "./matches";
import { computeMonthlyReport, type MonthlyReportData } from "./monthlyReport";
import { computeHighestScoringMatchRecord, type RecordEntry } from "./records";
import { computeWinRateLeaderboard, WIN_RATE_MIN_PLAYED } from "./stats";

function matchesInMonth(matches: MatchSummary[], year: number, month: number): MatchSummary[] {
  return matches.filter((m) => {
    const d = new Date(m.played_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

function totalGoalsOf(matches: MatchSummary[]): number {
  return matches.reduce((sum, m) => sum + m.sides[0].score + m.sides[1].score, 0);
}

/**
 * Absolute and percentage change vs. the previous month, for a single
 * numeric metric. `previous` is null when the previous month has no
 * meaningful basis for this metric (e.g. an average over zero matches) --
 * distinct from a previous value that's a real 0, which still yields a
 * defined (if unbounded) percent change only when previous isn't itself 0.
 */
export interface MonthlyMetricComparison {
  current: number;
  previous: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
}

export function compareToPreviousMonth(current: number, previous: number | null): MonthlyMetricComparison {
  const absoluteChange = previous === null ? null : current - previous;
  const percentChange = previous === null || previous === 0 ? null : ((current - previous) / previous) * 100;
  return { current, previous, absoluteChange, percentChange };
}

export interface MostSelectedClub {
  clubId: string;
  clubName: string;
  matchesPlayed: number;
}

/** Club with the most side-appearances within `matches` (both sides of a match count separately, mirroring leagueAnalytics.ts's club popularity convention). Null when no match in the set used a club. */
export function computeMostSelectedClub(matches: MatchSummary[]): MostSelectedClub | null {
  const counts = new Map<string, MostSelectedClub>();
  for (const match of matches) {
    for (const side of match.sides) {
      if (!side.club) continue;
      const entry = counts.get(side.club.id) ?? { clubId: side.club.id, clubName: side.club.name, matchesPlayed: 0 };
      entry.matchesPlayed++;
      counts.set(side.club.id, entry);
    }
  }
  let best: MostSelectedClub | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.matchesPlayed > best.matchesPlayed || (entry.matchesPlayed === best.matchesPlayed && entry.clubName.localeCompare(best.clubName) < 0)) {
      best = entry;
    }
  }
  return best;
}

export interface HighestEligibleWinRate {
  playerName: string;
  winRate: number;
}

/** Highest win rate among players who met the standard qualification threshold (stats.ts's WIN_RATE_MIN_PLAYED) within the given matches. Null if nobody qualifies. */
export function computeHighestEligibleWinRate(roster: MatchSidePlayer[], matches: MatchSummary[]): HighestEligibleWinRate | null {
  const top = computeWinRateLeaderboard(roster, matches, WIN_RATE_MIN_PLAYED)[0];
  return top ? { playerName: top.playerName, winRate: top.value } : null;
}

export interface MonthlySummaryData {
  year: number;
  month: number;
  /** Awards/topScorer/playerOfMonth etc, reused as-is from the existing monthly report engine. */
  report: MonthlyReportData;
  matchesPlayed: MonthlyMetricComparison;
  totalGoals: MonthlyMetricComparison;
  averageGoalsPerMatch: MonthlyMetricComparison;
  sessionsCompleted: MonthlyMetricComparison;
  highestEligibleWinRate: HighestEligibleWinRate | null;
  highestScoringMatch: RecordEntry | null;
  mostSelectedClub: MostSelectedClub | null;
}

/**
 * Everything the Monthly Summary screen needs for one month, including a
 * comparison against the previous month. Reuses computeMonthlyReport for
 * the award-style facts (player of month, top scorer, best partnership,
 * most improved, ...) rather than recalculating them -- this only adds the
 * facts that engine doesn't already produce (totals, sessions, highest
 * win rate, highest-scoring match, most selected club) plus the
 * month-over-month comparison.
 */
export function computeMonthlySummary(
  roster: MatchSidePlayer[],
  allMatches: MatchSummary[],
  completedSessionEndedAtTimestamps: readonly string[],
  year: number,
  month: number,
): MonthlySummaryData {
  const report = computeMonthlyReport(roster, allMatches, year, month);
  const monthMatches = matchesInMonth(allMatches, year, month);

  const priorMonthDate = new Date(year, month - 1, 1);
  const priorYear = priorMonthDate.getFullYear();
  const priorMonth = priorMonthDate.getMonth();
  const priorMonthMatches = matchesInMonth(allMatches, priorYear, priorMonth);

  const totalGoals = totalGoalsOf(monthMatches);
  const priorTotalGoals = totalGoalsOf(priorMonthMatches);

  const averageGoalsPerMatch = monthMatches.length === 0 ? 0 : totalGoals / monthMatches.length;
  const priorAverageGoalsPerMatch = priorMonthMatches.length === 0 ? null : priorTotalGoals / priorMonthMatches.length;

  const countSessionsInMonth = (y: number, m: number) =>
    completedSessionEndedAtTimestamps.filter((iso) => {
      const d = new Date(iso);
      return !Number.isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m;
    }).length;

  return {
    year,
    month,
    report,
    matchesPlayed: compareToPreviousMonth(monthMatches.length, priorMonthMatches.length),
    totalGoals: compareToPreviousMonth(totalGoals, priorTotalGoals),
    averageGoalsPerMatch: compareToPreviousMonth(averageGoalsPerMatch, priorAverageGoalsPerMatch),
    sessionsCompleted: compareToPreviousMonth(countSessionsInMonth(year, month), countSessionsInMonth(priorYear, priorMonth)),
    highestEligibleWinRate: computeHighestEligibleWinRate(roster, monthMatches),
    highestScoringMatch: computeHighestScoringMatchRecord(monthMatches),
    mostSelectedClub: computeMostSelectedClub(monthMatches),
  };
}
