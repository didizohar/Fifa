import type { MatchSidePlayer, MatchSummary } from "./matches";
import { computeMonthlyReport } from "./monthlyReport";
import { computeBiggestVictoryRecord, computeLongestLossStreakRecord, computeLongestWinStreakRecord, type RecordEntry } from "./records";
import { computeFewestConcededLeaderboard, computeGoalsScoredLeaderboard, findSides } from "./stats";
import { calculateLeagueTrendSummary } from "./trends/leagueTrends";

export interface RivalryInsight {
  playerAName: string;
  playerBName: string;
  matchesPlayed: number;
}

/** The pair of roster members who have played each other the most, across all their shared matches. Null when nobody has played anybody twice. */
export function computeMostFrequentRivalry(roster: readonly MatchSidePlayer[], matches: readonly MatchSummary[]): RivalryInsight | null {
  let best: RivalryInsight | null = null;

  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const a = roster[i]!;
      const b = roster[j]!;
      const shared = matches.filter((m) => {
        const sides = findSides(a.id, m);
        return sides !== null && sides.opponent.players.some((p) => p.id === b.id);
      });
      if (shared.length === 0) continue;

      const candidate: RivalryInsight = { playerAName: a.display_name, playerBName: b.display_name, matchesPlayed: shared.length };
      if (!best || candidate.matchesPlayed > best.matchesPlayed) best = candidate;
    }
  }

  return best;
}

export interface FormInsight {
  playerName: string;
  momentumScore: number;
}

export interface AwardInsight {
  playerName: string;
  value: number;
}

export interface InsightsSummary {
  bestForm: FormInsight | null;
  worstForm: FormInsight | null;
  playerOfMonth: AwardInsight | null;
  topScorer: AwardInsight | null;
  bestDefense: AwardInsight | null;
  biggestVictory: RecordEntry | null;
  mostFrequentRivalry: RivalryInsight | null;
  longestWinStreak: RecordEntry | null;
  longestLossStreak: RecordEntry | null;
  mostImprovedPlayer: FormInsight | null;
}

/**
 * Every card the Insights screen shows, in one call. Reuses the existing
 * trends/records/leaderboard engines rather than recalculating anything --
 * this module only assembles and (for player-of-month/top-scorer/best-
 * defense) reshapes their outputs into a single flat card shape. "Player
 * of the Month"/"Top Scorer" here are the CURRENT calendar month's award
 * facts; the rest are all-time/all-history stats.
 */
export function computeInsightsSummary(roster: MatchSidePlayer[], matches: MatchSummary[], now: Date = new Date()): InsightsSummary {
  const trendSummary = calculateLeagueTrendSummary(roster, matches, now);
  const monthlyReport = computeMonthlyReport(roster, matches, now.getFullYear(), now.getMonth());

  const playerOfMonthAward = monthlyReport.awards.find((a) => a.id === "player-of-month");
  const topScorerRow = computeGoalsScoredLeaderboard(roster, matches)[0];
  const bestDefenseRow = computeFewestConcededLeaderboard(roster, matches)[0];

  return {
    bestForm: trendSummary.hotPlayer ? { playerName: nameFor(roster, trendSummary.hotPlayer.playerId), momentumScore: trendSummary.hotPlayer.momentumScore } : null,
    worstForm: trendSummary.coldPlayer ? { playerName: nameFor(roster, trendSummary.coldPlayer.playerId), momentumScore: trendSummary.coldPlayer.momentumScore } : null,
    playerOfMonth: playerOfMonthAward ? { playerName: playerOfMonthAward.holderName, value: playerOfMonthAward.metric ?? 0 } : null,
    topScorer: topScorerRow ? { playerName: topScorerRow.playerName, value: topScorerRow.value } : null,
    bestDefense: bestDefenseRow ? { playerName: bestDefenseRow.playerName, value: bestDefenseRow.value } : null,
    biggestVictory: computeBiggestVictoryRecord(matches),
    mostFrequentRivalry: computeMostFrequentRivalry(roster, matches),
    longestWinStreak: computeLongestWinStreakRecord(roster, matches),
    longestLossStreak: computeLongestLossStreakRecord(roster, matches),
    mostImprovedPlayer: trendSummary.biggestImprovement
      ? { playerName: nameFor(roster, trendSummary.biggestImprovement.playerId), momentumScore: trendSummary.biggestImprovement.improvementScore }
      : null,
  };
}

function nameFor(roster: readonly MatchSidePlayer[], playerId: string): string {
  return roster.find((p) => p.id === playerId)?.display_name ?? playerId;
}
