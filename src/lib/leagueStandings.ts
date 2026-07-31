import { computeGoalStats, computePlayerStats } from "./stats";
import type { MatchSidePlayer, MatchSideSummary, MatchSummary } from "./matches";

/** Standard 3/1/0 league points -- distinct from the old Elo system (removed) and from playerAnalyticsView.ts's UI-only 3/1/0 form score, which is never used to rank or qualify players. This one is the League Table's actual ranking points. */
export function computeLeaguePoints(wins: number, draws: number): number {
  return wins * 3 + draws;
}

export interface LeagueStandingRow {
  /** playerId for an individual row, "playerIdA:playerIdB" (sorted) for a pair row. */
  id: string;
  name: string;
  /** [playerId] for individual, [playerIdA, playerIdB] (sorted) for a pair. */
  playerIds: string[];
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  winRate: number | null;
}

/**
 * Points desc, then goal difference, goals for, win rate, and wins, each as
 * a tiebreaker for the one before it, finally an alphabetical fallback so
 * ties are never left in an arbitrary (insertion-order-dependent) order.
 */
export function sortLeagueStandings(rows: LeagueStandingRow[]): LeagueStandingRow[] {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      (b.winRate ?? 0) - (a.winRate ?? 0) ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name),
  );
}

export type StandingsSortMetric = "points" | "wins" | "goals" | "goalDifference" | "winRate";

/**
 * Re-sorts already points-ordered rows (the default football sort, see
 * sortLeagueStandings) by an alternate League Table column -- "points" is
 * a no-op, since `rows` is expected to already be in that order. Ties fall
 * back to the existing points-based order, since JS's Array.sort is
 * stable.
 */
export function sortStandingsByMetric(rows: LeagueStandingRow[], metric: StandingsSortMetric): LeagueStandingRow[] {
  if (metric === "points") return rows;
  const valueOf: Record<Exclude<StandingsSortMetric, "points">, (row: LeagueStandingRow) => number> = {
    wins: (row) => row.wins,
    goals: (row) => row.goalsFor,
    goalDifference: (row) => row.goalDifference,
    winRate: (row) => row.winRate ?? -1,
  };
  const getValue = valueOf[metric];
  return [...rows].sort((a, b) => getValue(b) - getValue(a));
}

/** Individual standings across both singles and doubles matches, sorted. Players with zero played matches in the given set are omitted. */
export function computeIndividualStandings(roster: MatchSidePlayer[], matches: MatchSummary[]): LeagueStandingRow[] {
  const rows = roster
    .map((player): LeagueStandingRow => {
      const stats = computePlayerStats(player.id, matches);
      const goals = computeGoalStats(player.id, matches);
      return {
        id: player.id,
        name: player.display_name,
        playerIds: [player.id],
        played: stats.played,
        wins: stats.wins,
        draws: stats.draws,
        losses: stats.losses,
        goalsFor: goals.goalsScored,
        goalsAgainst: goals.goalsConceded,
        goalDifference: goals.goalsScored - goals.goalsConceded,
        points: computeLeaguePoints(stats.wins, stats.draws),
        winRate: stats.winRate,
      };
    })
    .filter((row) => row.played > 0);

  return sortLeagueStandings(rows);
}

interface PairAccumulator {
  ids: [string, string];
  names: [string, string];
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

/** Sorts a doubles side's two players by id (matches stats.ts's computeBestDoublesPairs convention), so the same pair always keys and displays identically regardless of which side of the match they were on. */
function pairKeyAndNames(side: MatchSideSummary): { key: string; ids: [string, string]; names: [string, string] } | null {
  if (side.players.length !== 2) return null;
  const [a, b] = [...side.players].sort((x, y) => x.id.localeCompare(y.id)) as [MatchSideSummary["players"][number], MatchSideSummary["players"][number]];
  return { key: `${a.id}:${b.id}`, ids: [a.id, b.id], names: [a.display_name, b.display_name] };
}

/** Doubles-pair standings -- each unique pair of teammates (not individual players) as one row, from doubles matches only. */
export function computePairStandings(matches: MatchSummary[]): LeagueStandingRow[] {
  const byPair = new Map<string, PairAccumulator>();

  for (const match of matches) {
    if (match.match_type !== "doubles") continue;
    const [side1, side2] = match.sides;

    for (const side of [side1, side2]) {
      const pair = pairKeyAndNames(side);
      if (!pair) continue;
      const opponent = side === side1 ? side2 : side1;

      const entry = byPair.get(pair.key) ?? { ids: pair.ids, names: pair.names, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
      if (side.result === "win") entry.wins++;
      else if (side.result === "loss") entry.losses++;
      else entry.draws++;
      entry.goalsFor += side.score;
      entry.goalsAgainst += opponent.score;
      byPair.set(pair.key, entry);
    }
  }

  const rows = [...byPair.values()].map((e): LeagueStandingRow => {
    const played = e.wins + e.draws + e.losses;
    return {
      id: `${e.ids[0]}:${e.ids[1]}`,
      name: `${e.names[0]} & ${e.names[1]}`,
      playerIds: e.ids,
      played,
      wins: e.wins,
      draws: e.draws,
      losses: e.losses,
      goalsFor: e.goalsFor,
      goalsAgainst: e.goalsAgainst,
      goalDifference: e.goalsFor - e.goalsAgainst,
      points: computeLeaguePoints(e.wins, e.draws),
      winRate: played === 0 ? null : e.wins / played,
    };
  });

  return sortLeagueStandings(rows);
}

export type StandingsDateFilter =
  | { type: "all" }
  | { type: "currentMonth" }
  | { type: "previousMonth" }
  | { type: "custom"; start: Date; end: Date };

/**
 * Restricts matches to a standings date filter. "currentMonth"/"previousMonth"
 * are calendar months relative to `now` (local time); "custom" is an
 * inclusive [start, end] range. Matches with an unparseable played_at are
 * dropped rather than crashing the comparison.
 */
export function filterMatchesForStandings(matches: MatchSummary[], filter: StandingsDateFilter, now: Date = new Date()): MatchSummary[] {
  if (filter.type === "all") return matches;

  let rangeStart: Date;
  let rangeEnd: Date;

  if (filter.type === "custom") {
    rangeStart = filter.start;
    rangeEnd = filter.end;
  } else {
    const monthOffset = filter.type === "currentMonth" ? 0 : -1;
    rangeStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1, 0, 0, 0, 0);
    rangeEnd = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0, 23, 59, 59, 999);
  }

  return matches.filter((m) => {
    const played = new Date(m.played_at);
    if (Number.isNaN(played.getTime())) return false;
    return played.getTime() >= rangeStart.getTime() && played.getTime() <= rangeEnd.getTime();
  });
}
