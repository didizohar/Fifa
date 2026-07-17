import type { MatchSideSummary, MatchSummary, PlayerRecordRow } from "./matches";
import type { SideResult } from "./types/database";

export interface PlayerStats {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null;
}

const EMPTY_STATS: PlayerStats = { played: 0, wins: 0, losses: 0, draws: 0, winRate: null };

/** Pure, I/O-free -- mirrors elo.ts's testable style. */
export function computePlayerStats(playerId: string, matches: MatchSummary[]): PlayerStats {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const match of matches) {
    for (const side of match.sides) {
      if (!side.players.some((p) => p.id === playerId)) continue;
      if (side.result === "win") wins++;
      else if (side.result === "loss") losses++;
      else draws++;
    }
  }

  const played = wins + losses + draws;
  if (played === 0) return EMPTY_STATS;

  return { played, wins, losses, draws, winRate: wins / played };
}

export function computeAllPlayerStats(playerIds: string[], matches: MatchSummary[]): Map<string, PlayerStats> {
  const result = new Map<string, PlayerStats>();
  for (const id of playerIds) result.set(id, computePlayerStats(id, matches));
  return result;
}

/**
 * Same shape as computePlayerStats, but from the lean, uncapped
 * fetchPlayerRecordRows() rows instead of a (possibly recency-limited)
 * MatchSummary[] -- see PlayerRecordRow's docstring in matches.ts for why
 * this is the correct source for "career record" style stats.
 */
export function computeRecordFromRows(playerId: string, rows: PlayerRecordRow[]): PlayerStats {
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const row of rows) {
    if (row.player_id !== playerId) continue;
    if (row.result === "win") wins++;
    else if (row.result === "loss") losses++;
    else draws++;
  }

  const played = wins + losses + draws;
  if (played === 0) return EMPTY_STATS;

  return { played, wins, losses, draws, winRate: wins / played };
}

export function computeAllRecordsFromRows(playerIds: string[], rows: PlayerRecordRow[]): Map<string, PlayerStats> {
  const result = new Map<string, PlayerStats>();
  for (const id of playerIds) result.set(id, computeRecordFromRows(id, rows));
  return result;
}

/** Which side a player was on for a match, and who they faced. Null if they didn't play in it. */
export function findSides(playerId: string, match: MatchSummary): { own: MatchSideSummary; opponent: MatchSideSummary } | null {
  const [s1, s2] = match.sides;
  if (s1.players.some((p) => p.id === playerId)) return { own: s1, opponent: s2 };
  if (s2.players.some((p) => p.id === playerId)) return { own: s2, opponent: s1 };
  return null;
}

export interface GoalStats {
  goalsScored: number;
  goalsConceded: number;
  goalsPerMatch: number | null;
  cleanSheets: number;
}

export function computeGoalStats(playerId: string, matches: MatchSummary[]): GoalStats {
  let goalsScored = 0;
  let goalsConceded = 0;
  let played = 0;
  let cleanSheets = 0;

  for (const match of matches) {
    const sides = findSides(playerId, match);
    if (!sides) continue;
    played++;
    goalsScored += sides.own.score;
    goalsConceded += sides.opponent.score;
    if (sides.opponent.score === 0) cleanSheets++;
  }

  return { goalsScored, goalsConceded, goalsPerMatch: played === 0 ? null : goalsScored / played, cleanSheets };
}

export interface StreakStats {
  currentStreak: { result: SideResult | null; count: number };
  longestWinStreak: number;
  longestLossStreak: number;
}

export function computeStreaks(playerId: string, matches: MatchSummary[]): StreakStats {
  const results = matches
    .filter((m) => findSides(playerId, m) !== null)
    .slice()
    .sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime())
    .map((m) => findSides(playerId, m)!.own.result);

  let longestWinStreak = 0;
  let longestLossStreak = 0;
  let runResult: SideResult | null = null;
  let runCount = 0;

  for (const result of results) {
    runCount = result === runResult ? runCount + 1 : 1;
    runResult = result;
    if (result === "win") longestWinStreak = Math.max(longestWinStreak, runCount);
    else if (result === "loss") longestLossStreak = Math.max(longestLossStreak, runCount);
  }

  return {
    currentStreak: results.length === 0 ? { result: null, count: 0 } : { result: runResult, count: runCount },
    longestWinStreak,
    longestLossStreak,
  };
}

export interface FormEntry {
  matchId: string;
  result: SideResult;
  playedAt: string;
}

export interface LastNStats {
  stats: PlayerStats;
  /** Most recent first. */
  form: FormEntry[];
}

/** Stats and form guide over a player's N most recent matches (default 10). */
export function computeLastNStats(playerId: string, matches: MatchSummary[], n = 10): LastNStats {
  const recent = matches
    .filter((m) => findSides(playerId, m) !== null)
    .slice()
    .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
    .slice(0, n);

  const form = recent.map((m) => ({ matchId: m.id, result: findSides(playerId, m)!.own.result, playedAt: m.played_at }));
  return { stats: computePlayerStats(playerId, recent), form };
}

export interface MarginResult {
  match: MatchSummary;
  ownScore: number;
  opponentScore: number;
  margin: number;
}

function findBiggestByResult(playerId: string, matches: MatchSummary[], result: "win" | "loss"): MarginResult | null {
  let best: MarginResult | null = null;
  for (const match of matches) {
    const sides = findSides(playerId, match);
    if (!sides || sides.own.result !== result) continue;
    const margin = Math.abs(sides.own.score - sides.opponent.score);
    if (!best || margin > best.margin) {
      best = { match, ownScore: sides.own.score, opponentScore: sides.opponent.score, margin };
    }
  }
  return best;
}

export function computeBiggestWin(playerId: string, matches: MatchSummary[]): MarginResult | null {
  return findBiggestByResult(playerId, matches, "win");
}

export function computeBiggestLoss(playerId: string, matches: MatchSummary[]): MarginResult | null {
  return findBiggestByResult(playerId, matches, "loss");
}

export interface HeadToHeadStats extends PlayerStats {
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

/** playerId's record, plus goal tally, in matches played directly against opponentId. */
export function computeHeadToHead(playerId: string, opponentId: string, matches: MatchSummary[]): HeadToHeadStats {
  const shared = matches.filter((m) => {
    const sides = findSides(playerId, m);
    return sides !== null && sides.opponent.players.some((p) => p.id === opponentId);
  });
  const record = computePlayerStats(playerId, shared);
  const goals = computeGoalStats(playerId, shared);
  return { ...record, goalsFor: goals.goalsScored, goalsAgainst: goals.goalsConceded, goalDifference: goals.goalsScored - goals.goalsConceded };
}

export interface ClubPerformanceRow {
  clubId: string;
  clubName: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null;
}

/** Player's record broken down by which club they played as, sorted by most-played first. */
export function computeClubPerformance(playerId: string, matches: MatchSummary[]): ClubPerformanceRow[] {
  const byClub = new Map<string, { name: string; wins: number; losses: number; draws: number }>();

  for (const match of matches) {
    const sides = findSides(playerId, match);
    if (!sides || !sides.own.club) continue;
    const club = sides.own.club;
    const entry = byClub.get(club.id) ?? { name: club.name, wins: 0, losses: 0, draws: 0 };
    if (sides.own.result === "win") entry.wins++;
    else if (sides.own.result === "loss") entry.losses++;
    else entry.draws++;
    byClub.set(club.id, entry);
  }

  return [...byClub.entries()]
    .map(([clubId, e]) => {
      const played = e.wins + e.losses + e.draws;
      return { clubId, clubName: e.name, played, wins: e.wins, losses: e.losses, draws: e.draws, winRate: played === 0 ? null : e.wins / played };
    })
    .sort((a, b) => b.played - a.played);
}

export interface PartnershipRow {
  teammateId: string;
  teammateName: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null;
}

/** Doubles-only record broken down by teammate, sorted by most-played first. */
export function computeDoublesPartnerships(playerId: string, matches: MatchSummary[]): PartnershipRow[] {
  const byMate = new Map<string, { name: string; wins: number; losses: number; draws: number }>();

  for (const match of matches) {
    if (match.match_type !== "doubles") continue;
    const sides = findSides(playerId, match);
    if (!sides) continue;
    for (const mate of sides.own.players.filter((p) => p.id !== playerId)) {
      const entry = byMate.get(mate.id) ?? { name: mate.display_name, wins: 0, losses: 0, draws: 0 };
      if (sides.own.result === "win") entry.wins++;
      else if (sides.own.result === "loss") entry.losses++;
      else entry.draws++;
      byMate.set(mate.id, entry);
    }
  }

  return [...byMate.entries()]
    .map(([teammateId, e]) => {
      const played = e.wins + e.losses + e.draws;
      return { teammateId, teammateName: e.name, played, wins: e.wins, losses: e.losses, draws: e.draws, winRate: played === 0 ? null : e.wins / played };
    })
    .sort((a, b) => b.played - a.played);
}
