import type { MatchSummary } from "./matches";

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
