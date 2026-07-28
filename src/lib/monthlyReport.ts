import type { MatchSidePlayer, MatchSummary } from "./matches";
import { computeAllRecords, type RecordEntry } from "./records";
import { computeBestDoublesPairs, computeConsistency, computeGoalsScoredLeaderboard, computeMonthlyLeaderboard, computeMostMatchesLeaderboard, computePlayerStats } from "./stats";

export type MonthlyAwardId = "player-of-month" | "top-scorer" | "most-active" | "best-partnership" | "most-consistent" | "most-improved";

/**
 * Language-independent award fact: which stat won it and who holds it, plus
 * the single raw number a UI formatter needs to build a localized value
 * label (e.g. wins, goals, a 0-1 win rate, or a goal-margin std-dev). `null`
 * only for best-partnership, when the pair hasn't recorded a result yet.
 */
export interface MonthlyAwardFact {
  id: MonthlyAwardId;
  holderName: string;
  metric: number | null;
}

export interface MonthlyReportData {
  year: number;
  month: number;
  matchesPlayed: number;
  awards: MonthlyAwardFact[];
  recordsBrokenCount: number;
  playerOfMonthName: string | null;
  topScorerName: string | null;
  topScorerGoals: number | null;
}

/** Minimum matches within a single calendar month to qualify for a monthly award -- deliberately lower than MIN_SAMPLE_SIZE, since a month naturally has far fewer matches than a lifetime sample. */
const MONTHLY_MIN_SAMPLE = 2;

function matchesInMonth(matches: MatchSummary[], year: number, month: number): MatchSummary[] {
  return matches.filter((m) => {
    const d = new Date(m.played_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

/**
 * A monthly recap's raw facts: award-style highlights plus the ingredients
 * for a narrative summary, all derived from the same match data
 * leaderboards already use. Every value here is language-independent --
 * turning it into display text (including pluralization and the month
 * name) is `formatMonthlyReport`'s job, not this function's. Records are
 * "broken this month" using the same setAt-based approximation as the
 * discovery engine, not a precise before/after snapshot diff.
 */
export function computeMonthlyReport(roster: MatchSidePlayer[], allMatches: MatchSummary[], year: number, month: number): MonthlyReportData {
  const monthMatches = matchesInMonth(allMatches, year, month);
  const awards: MonthlyAwardFact[] = [];

  const playerOfMonth = computeMonthlyLeaderboard(roster, allMatches, year, month)[0];
  if (playerOfMonth) {
    awards.push({ id: "player-of-month", holderName: playerOfMonth.playerName, metric: playerOfMonth.value });
  }

  const topScorer = computeGoalsScoredLeaderboard(roster, monthMatches)[0];
  if (topScorer) {
    awards.push({ id: "top-scorer", holderName: topScorer.playerName, metric: topScorer.value });
  }

  const mostActive = computeMostMatchesLeaderboard(roster, monthMatches)[0];
  if (mostActive) {
    awards.push({ id: "most-active", holderName: mostActive.playerName, metric: mostActive.value });
  }

  const bestPair = computeBestDoublesPairs(monthMatches, MONTHLY_MIN_SAMPLE)[0];
  if (bestPair) {
    awards.push({ id: "best-partnership", holderName: `${bestPair.playerNames[0]} & ${bestPair.playerNames[1]}`, metric: bestPair.winRate });
  }

  let mostConsistent: { player: MatchSidePlayer; stdDev: number } | null = null;
  for (const player of roster) {
    const consistency = computeConsistency(player.id, monthMatches);
    if (consistency.goalMarginStdDev === null) continue;
    if (!mostConsistent || consistency.goalMarginStdDev < mostConsistent.stdDev) {
      mostConsistent = { player, stdDev: consistency.goalMarginStdDev };
    }
  }
  if (mostConsistent) {
    awards.push({ id: "most-consistent", holderName: mostConsistent.player.display_name, metric: mostConsistent.stdDev });
  }

  const priorMonthDate = new Date(year, month - 1, 1);
  const priorMonthMatches = matchesInMonth(allMatches, priorMonthDate.getFullYear(), priorMonthDate.getMonth());
  let mostImproved: { player: MatchSidePlayer; delta: number } | null = null;
  for (const player of roster) {
    const thisMonth = computePlayerStats(player.id, monthMatches);
    const priorMonth = computePlayerStats(player.id, priorMonthMatches);
    if (thisMonth.played < MONTHLY_MIN_SAMPLE || priorMonth.played < MONTHLY_MIN_SAMPLE) continue;
    const delta = (thisMonth.winRate ?? 0) - (priorMonth.winRate ?? 0);
    if (delta > 0 && (!mostImproved || delta > mostImproved.delta)) mostImproved = { player, delta };
  }
  if (mostImproved) {
    awards.push({ id: "most-improved", holderName: mostImproved.player.display_name, metric: mostImproved.delta });
  }

  const recordsBrokenCount = computeAllRecords(roster, allMatches).filter((r: RecordEntry) => {
    const d = new Date(r.setAt);
    return d.getFullYear() === year && d.getMonth() === month;
  }).length;

  return {
    year,
    month,
    matchesPlayed: monthMatches.length,
    awards,
    recordsBrokenCount,
    playerOfMonthName: playerOfMonth?.playerName ?? null,
    topScorerName: topScorer?.playerName ?? null,
    topScorerGoals: topScorer?.value ?? null,
  };
}
