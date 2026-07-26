import type { MatchSidePlayer, MatchSideSummary, MatchSummary, PlayerRecordRow } from "./matches";
import type { SideResult } from "./types/database";

/** Below this many matches, a computed stat (win rate, best defense, doubles pair, chart) isn't a reliable sample. */
export const MIN_SAMPLE_SIZE = 3;

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

export interface LeaderboardRow {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  color: string;
  /** Raw metric this leaderboard is ranked by -- for sorting/testing, not display. */
  value: number;
  /** Formatted primary metric, e.g. "1050", "62%", "5". */
  valueLabel: string;
  /** Secondary line, e.g. "12W-3L-1D". */
  detail: string;
}

function recordDetail(stats: PlayerStats): string {
  return `${stats.wins}W-${stats.losses}L-${stats.draws}D`;
}

/** Qualification threshold for the primary win-rate ranking -- below this, a small sample (e.g. 1-0) could misleadingly top the board. */
export const WIN_RATE_MIN_PLAYED = 5;

/**
 * Primary ranking leaderboard. Restricted to players with at least minPlayed
 * matches; ranked by win rate, then wins, then goal difference, then goals
 * scored, then matches played (in that order) so ties resolve deterministically.
 */
export function computeWinRateLeaderboard(players: MatchSidePlayer[], matches: MatchSummary[], minPlayed = WIN_RATE_MIN_PLAYED): LeaderboardRow[] {
  return players
    .map((p) => ({ player: p, stats: computePlayerStats(p.id, matches), goals: computeGoalStats(p.id, matches) }))
    .filter((r) => r.stats.played >= minPlayed)
    .sort(
      (a, b) =>
        (b.stats.winRate ?? 0) - (a.stats.winRate ?? 0) ||
        b.stats.wins - a.stats.wins ||
        (b.goals.goalsScored - b.goals.goalsConceded) - (a.goals.goalsScored - a.goals.goalsConceded) ||
        b.goals.goalsScored - a.goals.goalsScored ||
        b.stats.played - a.stats.played,
    )
    .map((r) => ({
      playerId: r.player.id,
      playerName: r.player.display_name,
      avatarUrl: r.player.avatar_url,
      color: r.player.custom_color,
      value: r.stats.winRate ?? 0,
      valueLabel: `${Math.round((r.stats.winRate ?? 0) * 100)}%`,
      detail: recordDetail(r.stats),
    }));
}

export interface NotYetQualifiedRow {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  color: string;
  played: number;
  matchesRemaining: number;
}

/** Players who haven't reached the win-rate ranking's qualification threshold yet, sorted by matches played (closest to qualifying first). */
export function computeNotYetQualified(players: MatchSidePlayer[], matches: MatchSummary[], minPlayed = WIN_RATE_MIN_PLAYED): NotYetQualifiedRow[] {
  return players
    .map((p) => ({ player: p, played: computePlayerStats(p.id, matches).played }))
    .filter((r) => r.played < minPlayed)
    .sort((a, b) => b.played - a.played)
    .map((r) => ({
      playerId: r.player.id,
      playerName: r.player.display_name,
      avatarUrl: r.player.avatar_url,
      color: r.player.custom_color,
      played: r.played,
      matchesRemaining: minPlayed - r.played,
    }));
}

export interface WinRateRank {
  position: number;
  of: number;
}

/** 1-indexed rank among qualified players on the win-rate leaderboard. Null if the player isn't qualified (or the roster has nobody qualified). */
export function computeWinRateRank(playerId: string, players: MatchSidePlayer[], matches: MatchSummary[], minPlayed = WIN_RATE_MIN_PLAYED): WinRateRank | null {
  const leaderboard = computeWinRateLeaderboard(players, matches, minPlayed);
  const index = leaderboard.findIndex((r) => r.playerId === playerId);
  return index >= 0 ? { position: index + 1, of: leaderboard.length } : null;
}

/** Cumulative win rate (0-100) after each of the player's matches, oldest first -- an honest trend line derived purely from stored results. */
export function computeWinRateProgression(playerId: string, matches: MatchSummary[]): number[] {
  const ordered = matches
    .filter((m) => findSides(playerId, m) !== null)
    .slice()
    .sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());

  let wins = 0;
  return ordered.map((m, i) => {
    if (findSides(playerId, m)!.own.result === "win") wins++;
    return Math.round((wins / (i + 1)) * 100);
  });
}

export function computeMostMatchesLeaderboard(players: MatchSidePlayer[], matches: MatchSummary[]): LeaderboardRow[] {
  return players
    .map((p) => ({ player: p, stats: computePlayerStats(p.id, matches) }))
    .filter((r) => r.stats.played > 0)
    .sort((a, b) => b.stats.played - a.stats.played)
    .map((r) => ({
      playerId: r.player.id,
      playerName: r.player.display_name,
      avatarUrl: r.player.avatar_url,
      color: r.player.custom_color,
      value: r.stats.played,
      valueLabel: `${r.stats.played}`,
      detail: recordDetail(r.stats),
    }));
}

export function computeLongestStreakLeaderboard(players: MatchSidePlayer[], matches: MatchSummary[]): LeaderboardRow[] {
  return players
    .map((p) => ({ player: p, streaks: computeStreaks(p.id, matches) }))
    .filter((r) => r.streaks.longestWinStreak > 0)
    .sort((a, b) => b.streaks.longestWinStreak - a.streaks.longestWinStreak)
    .map((r) => ({
      playerId: r.player.id,
      playerName: r.player.display_name,
      avatarUrl: r.player.avatar_url,
      color: r.player.custom_color,
      value: r.streaks.longestWinStreak,
      valueLabel: `${r.streaks.longestWinStreak}`,
      detail: r.streaks.longestWinStreak === 1 ? "1 match" : `${r.streaks.longestWinStreak} matches`,
    }));
}

export function computeLongestLossStreakLeaderboard(players: MatchSidePlayer[], matches: MatchSummary[]): LeaderboardRow[] {
  return players
    .map((p) => ({ player: p, streaks: computeStreaks(p.id, matches) }))
    .filter((r) => r.streaks.longestLossStreak > 0)
    .sort((a, b) => b.streaks.longestLossStreak - a.streaks.longestLossStreak)
    .map((r) => ({
      playerId: r.player.id,
      playerName: r.player.display_name,
      avatarUrl: r.player.avatar_url,
      color: r.player.custom_color,
      value: r.streaks.longestLossStreak,
      valueLabel: `${r.streaks.longestLossStreak}`,
      detail: r.streaks.longestLossStreak === 1 ? "1 match" : `${r.streaks.longestLossStreak} matches`,
    }));
}

export function computeGoalsScoredLeaderboard(players: MatchSidePlayer[], matches: MatchSummary[]): LeaderboardRow[] {
  return players
    .map((p) => ({ player: p, goals: computeGoalStats(p.id, matches) }))
    .filter((r) => r.goals.goalsScored > 0)
    .sort((a, b) => b.goals.goalsScored - a.goals.goalsScored)
    .map((r) => ({
      playerId: r.player.id,
      playerName: r.player.display_name,
      avatarUrl: r.player.avatar_url,
      color: r.player.custom_color,
      value: r.goals.goalsScored,
      valueLabel: `${r.goals.goalsScored}`,
      detail: `${(r.goals.goalsPerMatch ?? 0).toFixed(2)} per match`,
    }));
}

/** Fewest goals conceded (best defensive record), restricted to players with at least minPlayed matches. */
export function computeFewestConcededLeaderboard(players: MatchSidePlayer[], matches: MatchSummary[], minPlayed = MIN_SAMPLE_SIZE): LeaderboardRow[] {
  return players
    .map((p) => ({ player: p, stats: computePlayerStats(p.id, matches), goals: computeGoalStats(p.id, matches) }))
    .filter((r) => r.stats.played >= minPlayed)
    .sort((a, b) => a.goals.goalsConceded - b.goals.goalsConceded)
    .map((r) => ({
      playerId: r.player.id,
      playerName: r.player.display_name,
      avatarUrl: r.player.avatar_url,
      color: r.player.custom_color,
      value: r.goals.goalsConceded,
      valueLabel: `${r.goals.goalsConceded}`,
      detail: `${(r.goals.goalsConceded / r.stats.played).toFixed(2)} per match`,
    }));
}

export function computeGoalDifferenceLeaderboard(players: MatchSidePlayer[], matches: MatchSummary[]): LeaderboardRow[] {
  return players
    .map((p) => ({ player: p, stats: computePlayerStats(p.id, matches), goals: computeGoalStats(p.id, matches) }))
    .filter((r) => r.stats.played > 0)
    .sort((a, b) => b.goals.goalsScored - b.goals.goalsConceded - (a.goals.goalsScored - a.goals.goalsConceded))
    .map((r) => {
      const diff = r.goals.goalsScored - r.goals.goalsConceded;
      return {
        playerId: r.player.id,
        playerName: r.player.display_name,
        avatarUrl: r.player.avatar_url,
        color: r.player.custom_color,
        value: diff,
        valueLabel: diff > 0 ? `+${diff}` : `${diff}`,
        detail: `${r.goals.goalsScored} for, ${r.goals.goalsConceded} against`,
      };
    });
}

export function computeCleanSheetsLeaderboard(players: MatchSidePlayer[], matches: MatchSummary[]): LeaderboardRow[] {
  return players
    .map((p) => ({ player: p, stats: computePlayerStats(p.id, matches), goals: computeGoalStats(p.id, matches) }))
    .filter((r) => r.goals.cleanSheets > 0)
    .sort((a, b) => b.goals.cleanSheets - a.goals.cleanSheets)
    .map((r) => ({
      playerId: r.player.id,
      playerName: r.player.display_name,
      avatarUrl: r.player.avatar_url,
      color: r.player.custom_color,
      value: r.goals.cleanSheets,
      valueLabel: `${r.goals.cleanSheets}`,
      detail: `in ${r.stats.played} matches`,
    }));
}

/** Ranking restricted to matches played in the given month (JS Date convention: month is 0-indexed), ranked by wins. */
export function computeMonthlyLeaderboard(
  players: MatchSidePlayer[],
  matches: MatchSummary[],
  year: number,
  month: number,
): LeaderboardRow[] {
  const inMonth = matches.filter((m) => {
    const d = new Date(m.played_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  return players
    .map((p) => ({ player: p, stats: computePlayerStats(p.id, inMonth) }))
    .filter((r) => r.stats.played > 0)
    .sort((a, b) => b.stats.wins - a.stats.wins || (b.stats.winRate ?? 0) - (a.stats.winRate ?? 0))
    .map((r) => ({
      playerId: r.player.id,
      playerName: r.player.display_name,
      avatarUrl: r.player.avatar_url,
      color: r.player.custom_color,
      value: r.stats.wins,
      valueLabel: r.stats.wins === 1 ? "1 win" : `${r.stats.wins} wins`,
      detail: `${r.stats.played} played · ${Math.round((r.stats.winRate ?? 0) * 100)}% win`,
    }));
}

export interface DoublesPairRow {
  playerIds: [string, string];
  playerNames: [string, string];
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number | null;
}

/** Group-wide doubles pair leaderboard (pair vs. pair, not one player's perspective), sorted by win rate then most played. */
export function computeBestDoublesPairs(matches: MatchSummary[], minPlayed = MIN_SAMPLE_SIZE): DoublesPairRow[] {
  const byPair = new Map<string, { ids: [string, string]; names: [string, string]; wins: number; losses: number; draws: number }>();

  for (const match of matches) {
    if (match.match_type !== "doubles") continue;
    for (const side of match.sides) {
      if (side.players.length !== 2) continue;
      const [p1, p2] = [...side.players].sort((a, b) => a.id.localeCompare(b.id)) as [MatchSidePlayer, MatchSidePlayer];
      const key = `${p1.id}:${p2.id}`;
      const entry = byPair.get(key) ?? { ids: [p1.id, p2.id], names: [p1.display_name, p2.display_name], wins: 0, losses: 0, draws: 0 };
      if (side.result === "win") entry.wins++;
      else if (side.result === "loss") entry.losses++;
      else entry.draws++;
      byPair.set(key, entry);
    }
  }

  return [...byPair.values()]
    .map((e) => {
      const played = e.wins + e.losses + e.draws;
      return { playerIds: e.ids, playerNames: e.names, played, wins: e.wins, losses: e.losses, draws: e.draws, winRate: played === 0 ? null : e.wins / played };
    })
    .filter((row) => row.played >= minPlayed)
    .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.played - a.played);
}

