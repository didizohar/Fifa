import type { MatchSidePlayer, MatchSummary } from "./matches";
import {
  computeIndividualStandings,
  computePairStandings,
  filterMatchesForStandings,
  type LeagueStandingRow,
} from "./leagueStandings";
import { computeMostSelectedClub, type MostSelectedClub } from "./monthlySummary";
import { computeHighestScoringMatchRecord, type RecordEntry } from "./records";
import {
  computeBestDoublesPairs,
  computeConsistency,
  computeFewestConcededLeaderboard,
  computeGoalsScoredLeaderboard,
  computeLongestLossStreakLeaderboard,
  computeLongestStreakLeaderboard,
  computeWinRateLeaderboard,
  MIN_SAMPLE_SIZE,
  WIN_RATE_MIN_PLAYED,
  type LeaderboardRow,
} from "./stats";
import type { Season } from "./types/database";

/** Restricts `matches` to a season's window: [start_date, end_date] for an archived season, or [start_date, now] for the still-active one. Works retroactively for matches recorded before season_id tagging existed -- the same date-range convention already used by the League Table's "Active Season" filter. */
export function matchesInSeasonWindow(matches: MatchSummary[], season: Season, now: Date = new Date()): MatchSummary[] {
  const end = season.end_date ? new Date(season.end_date) : now;
  return filterMatchesForStandings(matches, { type: "custom", start: new Date(season.start_date), end });
}

export interface SeasonCardSummary {
  season: Season;
  championName: string | null;
  totalMatches: number;
  totalGoals: number;
  totalPlayers: number;
  totalSessions: number;
  averageGoalsPerMatch: number | null;
}

/** Cheap, card-level summary -- the only thing Season History's list screen computes per season, so listing many seasons never runs the full awards/statistics engines just to render a list (see useSeasonReport.ts for the lazy-loaded full report). */
export function computeSeasonCardSummary(
  season: Season,
  roster: MatchSidePlayer[],
  seasonMatches: MatchSummary[],
  sessionEndedAtTimestamps: readonly string[],
): SeasonCardSummary {
  const standings = computeIndividualStandings(roster, seasonMatches);
  const totalGoals = seasonMatches.reduce((sum, m) => sum + m.sides[0].score + m.sides[1].score, 0);
  const totalPlayers = standings.length;
  const start = new Date(season.start_date).getTime();
  const end = season.end_date ? new Date(season.end_date).getTime() : Date.now();
  const totalSessions = sessionEndedAtTimestamps.filter((iso) => {
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t >= start && t <= end;
  }).length;

  return {
    season,
    championName: standings[0]?.name ?? null,
    totalMatches: seasonMatches.length,
    totalGoals,
    totalPlayers,
    totalSessions,
    averageGoalsPerMatch: seasonMatches.length === 0 ? null : totalGoals / seasonMatches.length,
  };
}

export interface LongestMatchDay {
  dateLabel: string;
  matchesPlayed: number;
}

/** The single calendar day (local time) with the most matches played in the season. Null for a season with no matches. */
export function computeLongestMatchDay(seasonMatches: MatchSummary[]): LongestMatchDay | null {
  const byDay = new Map<string, number>();
  for (const m of seasonMatches) {
    const d = new Date(m.played_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of byDay) {
    if (!best || count > best.count) best = { key, count };
  }
  if (!best) return null;
  const [y, mo, d] = best.key.split("-").map(Number);
  return { dateLabel: new Date(y!, mo!, d!).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }), matchesPlayed: best.count };
}

export interface SeasonOverview {
  champion: LeagueStandingRow | null;
  runnerUp: LeagueStandingRow | null;
  thirdPlace: LeagueStandingRow | null;
  totalMatches: number;
  totalGoals: number;
  averageGoalsPerMatch: number | null;
  totalPlayers: number;
  totalSessions: number;
  longestMatchDay: LongestMatchDay | null;
  highestScoringMatch: RecordEntry | null;
  mostPlayedClub: MostSelectedClub | null;
}

export function computeSeasonOverview(
  roster: MatchSidePlayer[],
  seasonMatches: MatchSummary[],
  sessionEndedAtTimestamps: readonly string[],
  season: Season,
): SeasonOverview {
  const standings = computeIndividualStandings(roster, seasonMatches);
  const totalGoals = seasonMatches.reduce((sum, m) => sum + m.sides[0].score + m.sides[1].score, 0);
  const start = new Date(season.start_date).getTime();
  const end = season.end_date ? new Date(season.end_date).getTime() : Date.now();
  const totalSessions = sessionEndedAtTimestamps.filter((iso) => {
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t >= start && t <= end;
  }).length;

  return {
    champion: standings[0] ?? null,
    runnerUp: standings[1] ?? null,
    thirdPlace: standings[2] ?? null,
    totalMatches: seasonMatches.length,
    totalGoals,
    averageGoalsPerMatch: seasonMatches.length === 0 ? null : totalGoals / seasonMatches.length,
    totalPlayers: standings.length,
    totalSessions,
    longestMatchDay: computeLongestMatchDay(seasonMatches),
    highestScoringMatch: computeHighestScoringMatchRecord(seasonMatches),
    mostPlayedClub: computeMostSelectedClub(seasonMatches),
  };
}

export interface SeasonAwardWinner {
  id: string;
  playerName: string;
  /** Translation keys + params -- the UI calls t(valueLabelKey, valueLabelParams) / t(detailKey, detailParams); this module never produces English text directly. */
  valueLabelKey: string;
  valueLabelParams: Record<string, string | number>;
  detailKey: string;
  detailParams: Record<string, string | number>;
}

export interface SeasonAwards {
  playerOfTheSeason: SeasonAwardWinner | null;
  goldenBoot: SeasonAwardWinner | null;
  bestDefense: SeasonAwardWinner | null;
  bestWinRate: SeasonAwardWinner | null;
  mostImproved: SeasonAwardWinner | null;
  mostConsistent: SeasonAwardWinner | null;
  bestDuo: SeasonAwardWinner | null;
  biggestSurprise: SeasonAwardWinner | null;
  longestWinStreak: SeasonAwardWinner | null;
  longestLosingStreak: SeasonAwardWinner | null;
}

function fromLeaderboardRow(row: LeaderboardRow): SeasonAwardWinner {
  return { id: row.playerId, playerName: row.playerName, valueLabelKey: "records.valueRaw", valueLabelParams: { value: row.valueLabel }, detailKey: row.detailKey, detailParams: row.detailParams };
}

/** First half vs second half of the season's matches (chronological, split by count not by date) -- works for a season of any length, unlike a fixed calendar-month comparison. Mirrors monthlyReport.ts's month-over-month "most improved" idea, applied to a season-relative boundary instead. */
function computeMostImprovedInSeason(roster: MatchSidePlayer[], seasonMatches: MatchSummary[]): SeasonAwardWinner | null {
  const ordered = [...seasonMatches].sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());
  const midpoint = Math.floor(ordered.length / 2);
  const firstHalf = ordered.slice(0, midpoint);
  const secondHalf = ordered.slice(midpoint);
  if (firstHalf.length === 0 || secondHalf.length === 0) return null;

  const firstHalfStandings = computeIndividualStandings(roster, firstHalf);
  const secondHalfStandings = computeIndividualStandings(roster, secondHalf);
  const firstByPlayer = new Map(firstHalfStandings.map((r) => [r.id, r]));
  const secondByPlayer = new Map(secondHalfStandings.map((r) => [r.id, r]));

  let best: { player: MatchSidePlayer; delta: number; before: number; after: number } | null = null;
  for (const player of roster) {
    const before = firstByPlayer.get(player.id);
    const after = secondByPlayer.get(player.id);
    if (!before || !after || before.played < MIN_SAMPLE_SIZE || after.played < MIN_SAMPLE_SIZE) continue;
    const delta = (after.winRate ?? 0) - (before.winRate ?? 0);
    if (delta > 0 && (!best || delta > best.delta)) best = { player, delta, before: before.winRate ?? 0, after: after.winRate ?? 0 };
  }
  if (!best) return null;
  return {
    id: best.player.id,
    playerName: best.player.display_name,
    valueLabelKey: "seasonReport.valueImprovedDelta",
    valueLabelParams: { points: Math.round(best.delta * 100) },
    detailKey: "seasonReport.detailWinRateBeforeAfter",
    detailParams: { before: Math.round(best.before * 100), after: Math.round(best.after * 100) },
  };
}

/** The most consistent player -- lowest goal-margin standard deviation among players with enough matches to qualify. */
function computeMostConsistentInSeason(roster: MatchSidePlayer[], seasonMatches: MatchSummary[]): SeasonAwardWinner | null {
  let best: { player: MatchSidePlayer; stdDev: number } | null = null;
  for (const player of roster) {
    const consistency = computeConsistency(player.id, seasonMatches);
    if (consistency.goalMarginStdDev === null) continue;
    if (!best || consistency.goalMarginStdDev < best.stdDev) best = { player, stdDev: consistency.goalMarginStdDev };
  }
  if (!best) return null;
  return {
    id: best.player.id,
    playerName: best.player.display_name,
    valueLabelKey: "records.valueRaw",
    valueLabelParams: { value: best.stdDev.toFixed(2) },
    detailKey: "seasonReport.detailConsistency",
    detailParams: {},
  };
}

/** Sorted "playerIdA:playerIdB" -- matches leagueStandings.ts's own pair-id convention, needed to look up a side's season win rate for surprise detection. */
function pairKey(ids: readonly string[]): string {
  return [...ids].sort((a, b) => a.localeCompare(b)).join(":");
}

/**
 * The match with the largest "surprise" margin -- the losing side (whether
 * an individual in a singles match or a pair in doubles) had a better
 * season-long win rate than the side that beat them. Generalizes the same
 * idea used for Winners Stay's per-session "biggest upset" to a full
 * season, and to singles matches too.
 */
function computeBiggestSurpriseInSeason(roster: MatchSidePlayer[], seasonMatches: MatchSummary[]): SeasonAwardWinner | null {
  const individualStandings = computeIndividualStandings(roster, seasonMatches);
  const pairStandings = computePairStandings(seasonMatches);
  const winRateByKey = new Map<string, number>();
  for (const row of individualStandings) winRateByKey.set(pairKey(row.playerIds), row.winRate ?? 0);
  for (const row of pairStandings) winRateByKey.set(pairKey(row.playerIds), row.winRate ?? 0);

  let best: { match: MatchSummary; winnerName: string; loserName: string; margin: number; winnerRate: number; loserRate: number } | null = null;
  for (const match of seasonMatches) {
    const [s1, s2] = match.sides;
    if (s1.result === "draw") continue;
    const winnerSide = s1.result === "win" ? s1 : s2;
    const loserSide = s1.result === "win" ? s2 : s1;
    const winnerKey = pairKey(winnerSide.players.map((p) => p.id));
    const loserKey = pairKey(loserSide.players.map((p) => p.id));
    const winnerRate = winRateByKey.get(winnerKey) ?? 0;
    const loserRate = winRateByKey.get(loserKey) ?? 0;
    if (loserRate <= winnerRate) continue;
    const margin = loserRate - winnerRate;
    if (!best || margin > best.margin) {
      best = {
        match,
        winnerName: winnerSide.players.map((p) => p.display_name).join(" & "),
        loserName: loserSide.players.map((p) => p.display_name).join(" & "),
        margin,
        winnerRate,
        loserRate,
      };
    }
  }
  if (!best) return null;
  return {
    id: best.match.id,
    playerName: best.winnerName,
    valueLabelKey: "seasonReport.valueBeat",
    valueLabelParams: { name: best.loserName },
    detailKey: "seasonReport.detailSurpriseRates",
    detailParams: { winnerRate: Math.round(best.winnerRate * 100), loserRate: Math.round(best.loserRate * 100) },
  };
}

export function computeSeasonAwards(roster: MatchSidePlayer[], seasonMatches: MatchSummary[]): SeasonAwards {
  const winRateBoard = computeWinRateLeaderboard(roster, seasonMatches, WIN_RATE_MIN_PLAYED);
  const goldenBootBoard = computeGoalsScoredLeaderboard(roster, seasonMatches);
  const bestDefenseBoard = computeFewestConcededLeaderboard(roster, seasonMatches, MIN_SAMPLE_SIZE);
  const winStreakBoard = computeLongestStreakLeaderboard(roster, seasonMatches);
  const lossStreakBoard = computeLongestLossStreakLeaderboard(roster, seasonMatches);
  const bestDuo = computeBestDoublesPairs(seasonMatches, MIN_SAMPLE_SIZE)[0] ?? null;
  const standings = computeIndividualStandings(roster, seasonMatches);

  return {
    // Same computation as the season Champion (points leader) -- shown again
    // here, award-show style, alongside the other individual awards.
    playerOfTheSeason: standings[0]
      ? {
          id: standings[0].id,
          playerName: standings[0].name,
          valueLabelKey: "seasonReport.valuePoints",
          valueLabelParams: { points: standings[0].points },
          detailKey: "seasonReport.detailWDL",
          detailParams: { wins: standings[0].wins, draws: standings[0].draws, losses: standings[0].losses },
        }
      : null,
    goldenBoot: goldenBootBoard[0] ? fromLeaderboardRow(goldenBootBoard[0]) : null,
    bestDefense: bestDefenseBoard[0] ? fromLeaderboardRow(bestDefenseBoard[0]) : null,
    bestWinRate: winRateBoard[0] ? fromLeaderboardRow(winRateBoard[0]) : null,
    mostImproved: computeMostImprovedInSeason(roster, seasonMatches),
    mostConsistent: computeMostConsistentInSeason(roster, seasonMatches),
    bestDuo: bestDuo
      ? {
          id: bestDuo.playerIds.join(":"),
          playerName: bestDuo.playerNames.join(" & "),
          valueLabelKey: "records.valueRaw",
          valueLabelParams: { value: bestDuo.winRate !== null ? `${Math.round(bestDuo.winRate * 100)}%` : "-" },
          detailKey: "leaderboards.detailRecordWLD",
          detailParams: { wins: bestDuo.wins, losses: bestDuo.losses, draws: bestDuo.draws },
        }
      : null,
    biggestSurprise: computeBiggestSurpriseInSeason(roster, seasonMatches),
    longestWinStreak: winStreakBoard[0] ? fromLeaderboardRow(winStreakBoard[0]) : null,
    longestLosingStreak: lossStreakBoard[0] ? fromLeaderboardRow(lossStreakBoard[0]) : null,
  };
}
