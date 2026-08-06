import { computeIndividualStandings } from "./leagueStandings";
import type { MatchSidePlayer, MatchSummary } from "./matches";

export interface LeagueSummary {
  matchesPlayed: number;
  totalGoals: number;
  playersCount: number;
  currentLeader: { playerId: string; playerName: string } | null;
}

export interface LeagueOverview {
  activePlayers: number;
  archivedPlayers: number;
  matchesPlayed: number;
}

/**
 * Active vs. archived player counts plus total matches played, for the
 * League Management overview. `roster` must include archived players
 * (fetch with `includeArchived: true`) for the archived count to be
 * meaningful -- an active-only roster would always report zero archived.
 */
export function computeLeagueOverview(roster: { is_active: boolean }[], matchesPlayed: number): LeagueOverview {
  const activePlayers = roster.filter((p) => p.is_active).length;
  return { activePlayers, archivedPlayers: roster.length - activePlayers, matchesPlayed };
}

/**
 * Group-wide totals for the dashboard's League Summary cards. currentLeader
 * is deliberately whoever's #1 in computeIndividualStandings -- the exact
 * same points-based standings engine (and, with all matches and no date
 * filter, the exact same ranking) as the League Table screen's default view
 * and the Dashboard's own LeagueTableCard widget. There must be only one
 * definition of "the leader" -- this must never diverge onto a different
 * metric (e.g. win rate), or the Dashboard and League Table can show two
 * different #1 players from the same data.
 */
export function computeLeagueSummary(roster: MatchSidePlayer[], matches: MatchSummary[]): LeagueSummary {
  const totalGoals = matches.reduce((sum, m) => sum + m.sides[0].score + m.sides[1].score, 0);
  const standings = computeIndividualStandings(roster, matches);
  const currentLeader = standings[0] ? { playerId: standings[0].id, playerName: standings[0].name } : null;
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
