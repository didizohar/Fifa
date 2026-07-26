import type { MatchSidePlayer, MatchSummary } from "./matches";
import { computeAllRecords, type RecordEntry } from "./records";
import { computeBestDoublesPairs, computeConsistency, computeGoalsScoredLeaderboard, computeMonthlyLeaderboard, computeMostMatchesLeaderboard, computePlayerStats } from "./stats";

export interface MonthlyAward {
  id: string;
  label: string;
  holderName: string;
  valueLabel: string;
}

export interface MonthlyReport {
  year: number;
  month: number;
  matchesPlayed: number;
  awards: MonthlyAward[];
  recordsBroken: RecordEntry[];
  story: string;
}

const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

function matchesInMonth(matches: MatchSummary[], year: number, month: number): MatchSummary[] {
  return matches.filter((m) => {
    const d = new Date(m.played_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

/**
 * A monthly recap: award-style highlights plus a short narrative summary,
 * all derived from the same match data leaderboards already use. Records
 * are "broken this month" using the same setAt-based approximation as the
 * discovery engine, not a precise before/after snapshot diff.
 */
export function computeMonthlyReport(roster: MatchSidePlayer[], allMatches: MatchSummary[], year: number, month: number): MonthlyReport {
  const monthMatches = matchesInMonth(allMatches, year, month);
  const awards: MonthlyAward[] = [];

  const playerOfMonth = computeMonthlyLeaderboard(roster, allMatches, year, month)[0];
  if (playerOfMonth) {
    awards.push({ id: "player-of-month", label: "Player of the Month", holderName: playerOfMonth.playerName, valueLabel: playerOfMonth.valueLabel });
  }

  const topScorer = computeGoalsScoredLeaderboard(roster, monthMatches)[0];
  if (topScorer) {
    awards.push({ id: "top-scorer", label: "Top Scorer", holderName: topScorer.playerName, valueLabel: `${topScorer.valueLabel} goals` });
  }

  const mostActive = computeMostMatchesLeaderboard(roster, monthMatches)[0];
  if (mostActive) {
    awards.push({ id: "most-active", label: "Most Active", holderName: mostActive.playerName, valueLabel: `${mostActive.valueLabel} matches` });
  }

  const bestPair = computeBestDoublesPairs(monthMatches, 2)[0];
  if (bestPair) {
    awards.push({
      id: "best-partnership",
      label: "Best Partnership",
      holderName: `${bestPair.playerNames[0]} & ${bestPair.playerNames[1]}`,
      valueLabel: bestPair.winRate !== null ? `${Math.round(bestPair.winRate * 100)}% win rate` : "-",
    });
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
    awards.push({ id: "most-consistent", label: "Most Consistent", holderName: mostConsistent.player.display_name, valueLabel: `±${mostConsistent.stdDev.toFixed(1)} goal swing` });
  }

  const priorMonthDate = new Date(year, month - 1, 1);
  const priorMonthMatches = matchesInMonth(allMatches, priorMonthDate.getFullYear(), priorMonthDate.getMonth());
  let mostImproved: { player: MatchSidePlayer; delta: number } | null = null;
  for (const player of roster) {
    const thisMonth = computePlayerStats(player.id, monthMatches);
    const priorMonth = computePlayerStats(player.id, priorMonthMatches);
    if (thisMonth.played < 2 || priorMonth.played < 2) continue;
    const delta = (thisMonth.winRate ?? 0) - (priorMonth.winRate ?? 0);
    if (delta > 0 && (!mostImproved || delta > mostImproved.delta)) mostImproved = { player, delta };
  }
  if (mostImproved) {
    awards.push({
      id: "most-improved",
      label: "Most Improved",
      holderName: mostImproved.player.display_name,
      valueLabel: `+${Math.round(mostImproved.delta * 100)} pts win rate`,
    });
  }

  const recordsBroken = computeAllRecords(roster, allMatches).filter((r) => {
    const d = new Date(r.setAt);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const storyParts = [`In ${MONTH_LABEL.format(new Date(year, month, 1))}, the group played ${monthMatches.length} match${monthMatches.length === 1 ? "" : "es"}.`];
  if (playerOfMonth) storyParts.push(`${playerOfMonth.playerName} was Player of the Month.`);
  if (topScorer) storyParts.push(`${topScorer.playerName} led the scoring charts with ${topScorer.valueLabel} goals.`);
  if (recordsBroken.length > 0) storyParts.push(`${recordsBroken.length} group record${recordsBroken.length === 1 ? " was" : "s were"} broken.`);

  return { year, month, matchesPlayed: monthMatches.length, awards, recordsBroken, story: storyParts.join(" ") };
}
