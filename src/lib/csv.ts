import { matchSideLabel } from "./format";
import type { MatchSidePlayer, MatchSummary } from "./matches";
import type { LeaderboardRow } from "./stats";
import { computeGoalStats, computePlayerStats, computeStreaks } from "./stats";

function escapeCell(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** RFC 4180-ish CSV serialization: quotes cells containing commas, quotes, or newlines. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(escapeCell).join(","), ...rows.map((row) => row.map(escapeCell).join(","))];
  return lines.join("\r\n");
}

export function matchesToCsv(matches: MatchSummary[]): string {
  const headers = [
    "Date",
    "Type",
    "Side 1 Players",
    "Side 1 Club",
    "Side 1 Score",
    "Side 1 Result",
    "Side 2 Players",
    "Side 2 Club",
    "Side 2 Score",
    "Side 2 Result",
    "Penalties",
  ];
  const rows = matches.map((m) => {
    const [s1, s2] = m.sides;
    return [
      new Date(m.played_at).toISOString(),
      m.match_type,
      matchSideLabel(s1.players.map((p) => p.display_name)),
      s1.club?.name ?? "",
      s1.score,
      s1.result,
      matchSideLabel(s2.players.map((p) => p.display_name)),
      s2.club?.name ?? "",
      s2.score,
      s2.result,
      m.is_penalties ? "yes" : "no",
    ];
  });
  return toCsv(headers, rows);
}

export function playerStatsToCsv(players: MatchSidePlayer[], matches: MatchSummary[]): string {
  const headers = [
    "Player",
    "Played",
    "Wins",
    "Losses",
    "Draws",
    "Win Rate %",
    "Goals Scored",
    "Goals Conceded",
    "Goal Difference",
    "Clean Sheets",
    "Current Streak",
    "Longest Win Streak",
    "Longest Loss Streak",
  ];
  const rows = players.map((p) => {
    const stats = computePlayerStats(p.id, matches);
    const goals = computeGoalStats(p.id, matches);
    const streaks = computeStreaks(p.id, matches);
    return [
      p.display_name,
      stats.played,
      stats.wins,
      stats.losses,
      stats.draws,
      stats.winRate !== null ? Math.round(stats.winRate * 100) : 0,
      goals.goalsScored,
      goals.goalsConceded,
      goals.goalsScored - goals.goalsConceded,
      goals.cleanSheets,
      streaks.currentStreak.count > 0 ? `${streaks.currentStreak.count} ${streaks.currentStreak.result}` : "-",
      streaks.longestWinStreak,
      streaks.longestLossStreak,
    ];
  });
  return toCsv(headers, rows);
}

export function leaderboardToCsv(rows: LeaderboardRow[]): string {
  const headers = ["Rank", "Player", "Value", "Detail"];
  const csvRows = rows.map((row, index) => [index + 1, row.playerName, row.valueLabel, row.detail]);
  return toCsv(headers, csvRows);
}
