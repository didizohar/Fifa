import type { MatchSidePlayer, MatchSummary } from "./matches";
import { computeWinRateLeaderboard } from "./stats";

export interface LeagueSummary {
  matchesPlayed: number;
  totalGoals: number;
  playersCount: number;
  currentLeader: { playerId: string; playerName: string } | null;
}

/** Group-wide totals for the dashboard's League Summary cards. */
export function computeLeagueSummary(roster: MatchSidePlayer[], matches: MatchSummary[]): LeagueSummary {
  const totalGoals = matches.reduce((sum, m) => sum + m.sides[0].score + m.sides[1].score, 0);
  const leaders = computeWinRateLeaderboard(roster, matches);
  const currentLeader = leaders[0] ? { playerId: leaders[0].playerId, playerName: leaders[0].playerName } : null;
  return { matchesPlayed: matches.length, totalGoals, playersCount: roster.length, currentLeader };
}

export interface WeeklyActivityRow {
  /** Short display label for the week, e.g. "3/17". */
  weekLabel: string;
  /** ISO date (yyyy-mm-dd) of the Monday that starts this week -- for testing/reference, not display. */
  weekStart: string;
  count: number;
}

/** Midnight Monday of the calendar week containing `date`, in local time. */
function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 (Sun) - 6 (Sat)
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

/**
 * Matches per week for the most recent `weeks` calendar weeks, oldest first,
 * including weeks with zero matches so an activity chart shows real gaps
 * rather than silently compressing them out.
 */
export function computeMatchesPerWeek(matches: readonly MatchSummary[], now: Date = new Date(), weeks = 8): WeeklyActivityRow[] {
  const currentWeekStart = startOfWeek(now);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(weekStart.getDate() - (weeks - 1 - i) * 7);
    return { weekStart, count: 0 };
  });

  for (const match of matches) {
    const matchWeekStart = startOfWeek(new Date(match.played_at)).getTime();
    const bucket = buckets.find((b) => b.weekStart.getTime() === matchWeekStart);
    if (bucket) bucket.count++;
  }

  return buckets.map((b) => ({
    weekLabel: `${b.weekStart.getMonth() + 1}/${b.weekStart.getDate()}`,
    weekStart: b.weekStart.toISOString().slice(0, 10),
    count: b.count,
  }));
}
