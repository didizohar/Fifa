import { dailySeed, seededShuffle } from "./discovery";
import type { MatchSidePlayer, MatchSummary } from "./matches";
import { MIN_SAMPLE_SIZE, computeLastNStats, findSides } from "./stats";

export interface LeagueInsight {
  id: string;
  text: string;
  /** Rough interestingness score used to rank items -- higher surfaces first. */
  score: number;
}

const HOT_FORM_WINDOW = 10;
const HOT_FORM_MIN_WINS = 7;
const DORMANT_RIVALRY_MIN_DAYS = 14;
const ONE_GOAL_MARGIN_SHARE = 0.5;

/** Players who've won most of their last HOT_FORM_WINDOW matches -- "Daniel has won 8 of his last 10 matches." */
function hotFormInsights(roster: readonly MatchSidePlayer[], matches: readonly MatchSummary[]): LeagueInsight[] {
  const items: LeagueInsight[] = [];
  for (const player of roster) {
    const { stats, form } = computeLastNStats(player.id, [...matches], HOT_FORM_WINDOW);
    if (form.length < HOT_FORM_WINDOW || stats.wins < HOT_FORM_MIN_WINS) continue;
    items.push({
      id: `hot-form-${player.id}`,
      text: `${player.display_name} has won ${stats.wins} of their last ${form.length} matches.`,
      score: 70 + stats.wins,
    });
  }
  return items;
}

/** Pairs who've played each other before but not recently -- "Didi hasn't played against Omer in 21 days." */
function dormantRivalryInsights(roster: readonly MatchSidePlayer[], matches: readonly MatchSummary[], now: Date): LeagueInsight[] {
  const items: LeagueInsight[] = [];
  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const a = roster[i]!;
      const b = roster[j]!;
      const shared = matches.filter((m) => {
        const sides = findSides(a.id, m);
        return sides !== null && sides.opponent.players.some((p) => p.id === b.id);
      });
      if (shared.length === 0) continue;

      const lastPlayedAt = shared.reduce((latest, m) => (m.played_at > latest ? m.played_at : latest), shared[0]!.played_at);
      const daysSince = Math.floor((now.getTime() - new Date(lastPlayedAt).getTime()) / 86_400_000);
      if (daysSince < DORMANT_RIVALRY_MIN_DAYS) continue;

      items.push({
        id: `dormant-rivalry-${a.id}-${b.id}`,
        text: `${a.display_name} hasn't played against ${b.display_name} in ${daysSince} days.`,
        score: 40 + Math.min(daysSince, 60),
      });
    }
  }
  return items;
}

/** When most of this month's matches were decided by a single goal -- "Most matches this month ended with one goal difference." */
function oneGoalMarginInsight(matches: readonly MatchSummary[], now: Date): LeagueInsight[] {
  const inMonth = matches.filter((m) => {
    const d = new Date(m.played_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  if (inMonth.length < MIN_SAMPLE_SIZE) return [];

  const oneGoalMargin = inMonth.filter((m) => Math.abs(m.sides[0].score - m.sides[1].score) === 1);
  if (oneGoalMargin.length / inMonth.length < ONE_GOAL_MARGIN_SHARE) return [];

  return [
    {
      id: `one-goal-margin-${now.getFullYear()}-${now.getMonth()}`,
      text: "Most matches this month ended with one goal difference.",
      score: 45,
    },
  ];
}

/** Every honestly-derivable group-wide (not single-player) insight right now. */
export function generateLeagueInsights(roster: readonly MatchSidePlayer[], matches: readonly MatchSummary[], now: Date = new Date()): LeagueInsight[] {
  return [...hotFormInsights(roster, matches), ...dormantRivalryInsights(roster, matches, now), ...oneGoalMarginInsight(matches, now)];
}

/**
 * The single best "Insight of the Day" for the dashboard -- highest score,
 * with a same-day-stable shuffle breaking ties so an equally-interesting
 * runner-up doesn't always lose to whichever generator happened to run
 * first. Null when nothing honestly qualifies yet.
 */
export function selectInsightOfTheDay(roster: readonly MatchSidePlayer[], matches: readonly MatchSummary[], now: Date = new Date()): LeagueInsight | null {
  const items = generateLeagueInsights(roster, matches, now);
  if (items.length === 0) return null;
  return seededShuffle(items, dailySeed(now)).sort((a, b) => b.score - a.score)[0] ?? null;
}
