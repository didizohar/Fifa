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
  averageScoreFor: number | null;
  averageScoreAgainst: number | null;
  largestVictory: MarginResult | null;
  largestDefeat: MarginResult | null;
  currentStreak: StreakStats["currentStreak"];
}

function sharedMatches(playerId: string, opponentId: string, matches: MatchSummary[]): MatchSummary[] {
  return matches.filter((m) => {
    const sides = findSides(playerId, m);
    return sides !== null && sides.opponent.players.some((p) => p.id === opponentId);
  });
}

/** playerId's full record against opponentId: result, goals, averages, best/worst result, and current streak in this rivalry specifically. */
export function computeHeadToHead(playerId: string, opponentId: string, matches: MatchSummary[]): HeadToHeadStats {
  const shared = sharedMatches(playerId, opponentId, matches);
  const record = computePlayerStats(playerId, shared);
  const goals = computeGoalStats(playerId, shared);
  return {
    ...record,
    goalsFor: goals.goalsScored,
    goalsAgainst: goals.goalsConceded,
    goalDifference: goals.goalsScored - goals.goalsConceded,
    averageScoreFor: record.played === 0 ? null : goals.goalsScored / record.played,
    averageScoreAgainst: record.played === 0 ? null : goals.goalsConceded / record.played,
    largestVictory: computeBiggestWin(playerId, shared),
    largestDefeat: computeBiggestLoss(playerId, shared),
    currentStreak: computeStreaks(playerId, shared).currentStreak,
  };
}

export interface OpponentSummary {
  opponentId: string;
  opponentName: string;
  headToHead: HeadToHeadStats;
}

/** The opponent playerId has played the most matches against (qualified by at least one shared match). Null with no opponents. */
export function computeFavoriteOpponent(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[]): OpponentSummary | null {
  let best: OpponentSummary | null = null;
  for (const opponent of roster) {
    if (opponent.id === playerId) continue;
    const headToHead = computeHeadToHead(playerId, opponent.id, matches);
    if (headToHead.played === 0) continue;
    if (!best || headToHead.played > best.headToHead.played) {
      best = { opponentId: opponent.id, opponentName: opponent.display_name, headToHead };
    }
  }
  return best;
}

/** The opponent playerId has the lowest win rate against, among opponents played at least minPlayed times. Null if nobody qualifies. */
export function computeNemesis(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[], minPlayed = MIN_SAMPLE_SIZE): OpponentSummary | null {
  let worst: OpponentSummary | null = null;
  for (const opponent of roster) {
    if (opponent.id === playerId) continue;
    const headToHead = computeHeadToHead(playerId, opponent.id, matches);
    if (headToHead.played < minPlayed) continue;
    if (!worst || (headToHead.winRate ?? 0) < (worst.headToHead.winRate ?? 0)) {
      worst = { opponentId: opponent.id, opponentName: opponent.display_name, headToHead };
    }
  }
  return worst;
}

export interface RivalryRow {
  playerIds: [string, string];
  playerNames: [string, string];
  played: number;
  /** Win rate of playerIds[0] against playerIds[1]. */
  winRateForFirst: number;
  /** How close the rivalry is to a 50/50 split -- 0 is perfectly balanced. */
  balance: number;
  /** When this pair first played each other. */
  firstMatchAt: string;
}

/** Every pair of players who've faced each other at least minPlayed times, one row per pair. */
export function computeRivalries(roster: MatchSidePlayer[], matches: MatchSummary[], minPlayed = MIN_SAMPLE_SIZE): RivalryRow[] {
  const rows: RivalryRow[] = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const [a, b] = [roster[i]!, roster[j]!];
      const shared = sharedMatches(a.id, b.id, matches);
      if (shared.length < minPlayed) continue;
      const stats = computePlayerStats(a.id, shared);
      const firstMatchAt = shared.reduce((earliest, m) => (m.played_at < earliest ? m.played_at : earliest), shared[0]!.played_at);
      rows.push({
        playerIds: [a.id, b.id],
        playerNames: [a.display_name, b.display_name],
        played: shared.length,
        winRateForFirst: stats.winRate ?? 0,
        balance: Math.abs((stats.winRate ?? 0) - 0.5),
        firstMatchAt,
      });
    }
  }
  return rows;
}

/** The rivalry closest to a 50/50 split among qualified pairs. Null if no pair qualifies. */
export function computeMostBalancedRivalry(roster: MatchSidePlayer[], matches: MatchSummary[], minPlayed = MIN_SAMPLE_SIZE): RivalryRow | null {
  const rivalries = computeRivalries(roster, matches, minPlayed);
  if (rivalries.length === 0) return null;
  return rivalries.reduce((best, row) => (row.balance < best.balance ? row : best));
}

/** The longest-running rivalry, by the date the pair first played each other. Null if no pair qualifies. */
export function computeOldestRivalry(roster: MatchSidePlayer[], matches: MatchSummary[], minPlayed = MIN_SAMPLE_SIZE): RivalryRow | null {
  const rivalries = computeRivalries(roster, matches, minPlayed);
  if (rivalries.length === 0) return null;
  return rivalries.reduce((oldest, row) => (row.firstMatchAt < oldest.firstMatchAt ? row : oldest));
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

export interface MatchTypeSplit {
  singles: PlayerStats;
  doubles: PlayerStats;
}

/** A player's record broken out by singles vs. doubles. */
export function computeMatchTypeSplit(playerId: string, matches: MatchSummary[]): MatchTypeSplit {
  return {
    singles: computePlayerStats(playerId, matches.filter((m) => m.match_type === "singles")),
    doubles: computePlayerStats(playerId, matches.filter((m) => m.match_type === "doubles")),
  };
}

export interface SpecialConditionsPerformance {
  overtime: PlayerStats;
  penalties: PlayerStats;
}

/** A player's record restricted to matches that went to overtime, and separately to penalties. */
export function computeSpecialConditionsPerformance(playerId: string, matches: MatchSummary[]): SpecialConditionsPerformance {
  return {
    overtime: computePlayerStats(playerId, matches.filter((m) => m.is_overtime)),
    penalties: computePlayerStats(playerId, matches.filter((m) => m.is_penalties)),
  };
}

export interface DayOfWeekRow {
  /** 0 (Sunday) - 6 (Saturday), per Date#getDay(), in the device's local time zone. */
  day: number;
  stats: PlayerStats;
}

/** A player's record broken down by day of week, one row per day (0-6) regardless of whether they've played on it. */
export function computeDayOfWeekPerformance(playerId: string, matches: MatchSummary[]): DayOfWeekRow[] {
  const byDay = new Map<number, MatchSummary[]>();
  for (const match of matches) {
    if (findSides(playerId, match) === null) continue;
    const day = new Date(match.played_at).getDay();
    const list = byDay.get(day) ?? [];
    list.push(match);
    byDay.set(day, list);
  }
  return Array.from({ length: 7 }, (_, day) => ({ day, stats: computePlayerStats(playerId, byDay.get(day) ?? []) }));
}

/**
 * A player's record restricted to matches that followed a gap of at least
 * breakDays since their previous match -- the very first match ever played
 * has no "previous match" to compare against, so it's never included.
 */
export function computePerformanceAfterBreak(playerId: string, matches: MatchSummary[], breakDays = 7): PlayerStats {
  const ordered = matches
    .filter((m) => findSides(playerId, m) !== null)
    .slice()
    .sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());

  const afterBreak: MatchSummary[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const gapDays = (new Date(ordered[i]!.played_at).getTime() - new Date(ordered[i - 1]!.played_at).getTime()) / 86_400_000;
    if (gapDays >= breakDays) afterBreak.push(ordered[i]!);
  }
  return computePlayerStats(playerId, afterBreak);
}

export interface ConsistencyStats {
  /** Standard deviation of the player's per-match goal margin (own score minus opponent score) -- lower means more consistent. Null below MIN_SAMPLE_SIZE matches. */
  goalMarginStdDev: number | null;
  matchesConsidered: number;
}

/** How consistent a player's results are, measured by the spread of their goal margin match to match (not win rate itself, which hides blowouts and nail-biters alike). */
export function computeConsistency(playerId: string, matches: MatchSummary[]): ConsistencyStats {
  const margins = matches
    .map((m) => findSides(playerId, m))
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map((s) => s.own.score - s.opponent.score);

  if (margins.length < MIN_SAMPLE_SIZE) return { goalMarginStdDev: null, matchesConsidered: margins.length };

  const mean = margins.reduce((sum, m) => sum + m, 0) / margins.length;
  const variance = margins.reduce((sum, m) => sum + (m - mean) ** 2, 0) / margins.length;
  return { goalMarginStdDev: Math.sqrt(variance), matchesConsidered: margins.length };
}

export type FormTrend = "improving" | "declining" | "stable";

export interface FormTrendResult {
  /** Null when there isn't enough history for two full windows to compare. */
  trend: FormTrend | null;
  recentWinRate: number | null;
  previousWinRate: number | null;
}

/**
 * Compares win rate across the most recent windowSize matches against the
 * windowSize matches before that -- an honest, data-only signal for whether
 * a player is trending up or down, not just their lifetime average.
 */
export function computeFormTrend(playerId: string, matches: MatchSummary[], windowSize = 5): FormTrendResult {
  const ordered = matches
    .filter((m) => findSides(playerId, m) !== null)
    .slice()
    .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());

  if (ordered.length < windowSize * 2) return { trend: null, recentWinRate: null, previousWinRate: null };

  const recentRate = computePlayerStats(playerId, ordered.slice(0, windowSize)).winRate ?? 0;
  const previousRate = computePlayerStats(playerId, ordered.slice(windowSize, windowSize * 2)).winRate ?? 0;
  const delta = recentRate - previousRate;
  const trend: FormTrend = delta > 0.1 ? "improving" : delta < -0.1 ? "declining" : "stable";
  return { trend, recentWinRate: recentRate, previousWinRate: previousRate };
}

export interface MonthlyTrendRow {
  year: number;
  /** 0-indexed, per JS Date convention. */
  month: number;
  stats: PlayerStats;
}

/** A player's stats grouped by calendar month, chronological (oldest first). Only months with at least one match appear. */
export function computePlayerMonthlyTrend(playerId: string, matches: MatchSummary[]): MonthlyTrendRow[] {
  const byMonth = new Map<string, { year: number; month: number; matches: MatchSummary[] }>();
  for (const match of matches) {
    if (findSides(playerId, match) === null) continue;
    const d = new Date(match.played_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const entry = byMonth.get(key) ?? { year: d.getFullYear(), month: d.getMonth(), matches: [] };
    entry.matches.push(match);
    byMonth.set(key, entry);
  }
  return [...byMonth.values()]
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((e) => ({ year: e.year, month: e.month, stats: computePlayerStats(playerId, e.matches) }));
}

