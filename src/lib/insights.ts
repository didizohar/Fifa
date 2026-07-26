import type { MatchSidePlayer, MatchSummary } from "./matches";
import { computeConsistency, computeDoublesPartnerships, computeFormTrend, computeMatchTypeSplit, computeNemesis, computePlayerStats, findSides, MIN_SAMPLE_SIZE } from "./stats";

export interface Insight {
  id: string;
  text: string;
  /** Rough interestingness score for ranking when multiple insights are available -- higher surfaces first. */
  score: number;
}

/** The bar for "clearly" better/worse rather than noise -- 15 percentage points. */
const NOTABLE_GAP = 0.15;

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function formTrendInsight(playerId: string, matches: MatchSummary[]): Insight[] {
  const { trend, recentWinRate, previousWinRate } = computeFormTrend(playerId, matches, 5);
  if (trend === null || trend === "stable" || recentWinRate === null || previousWinRate === null) return [];
  if (trend === "improving") {
    return [
      {
        id: "form-improving",
        text: `You're improving -- you've won ${pct(recentWinRate)} of your last 5 matches, up from ${pct(previousWinRate)} the 5 before that.`,
        score: 75,
      },
    ];
  }
  return [
    {
      id: "form-declining",
      text: `Your form has dipped -- you've won ${pct(recentWinRate)} of your last 5 matches, down from ${pct(previousWinRate)} the 5 before that.`,
      score: 60,
    },
  ];
}

function matchTypeInsight(playerId: string, matches: MatchSummary[]): Insight[] {
  const { singles, doubles } = computeMatchTypeSplit(playerId, matches);
  if (singles.played < MIN_SAMPLE_SIZE || doubles.played < MIN_SAMPLE_SIZE) return [];
  const singlesRate = singles.winRate ?? 0;
  const doublesRate = doubles.winRate ?? 0;
  const diff = doublesRate - singlesRate;
  if (diff >= NOTABLE_GAP) {
    return [{ id: "better-in-doubles", text: `You perform much better in doubles than singles (${pct(doublesRate)} vs ${pct(singlesRate)} win rate).`, score: 65 }];
  }
  if (-diff >= NOTABLE_GAP) {
    return [{ id: "better-in-singles", text: `You perform much better in singles than doubles (${pct(singlesRate)} vs ${pct(doublesRate)} win rate).`, score: 65 }];
  }
  return [];
}

function partnershipInsight(playerId: string, matches: MatchSummary[]): Insight[] {
  const overallDoubles = computeMatchTypeSplit(playerId, matches).doubles;
  if (overallDoubles.played < MIN_SAMPLE_SIZE) return [];
  const partnerships = computeDoublesPartnerships(playerId, matches).filter((p) => p.played >= MIN_SAMPLE_SIZE);
  if (partnerships.length === 0) return [];
  const best = partnerships.reduce((top, p) => ((p.winRate ?? 0) > (top.winRate ?? 0) ? p : top));
  const diff = (best.winRate ?? 0) - (overallDoubles.winRate ?? 0);
  if (diff >= NOTABLE_GAP) {
    return [
      {
        id: `strongest-partnership-${best.teammateId}`,
        text: `Your strongest partnership is with ${best.teammateName} -- you win ${pct(best.winRate ?? 0)} of matches together, well above your ${pct(overallDoubles.winRate ?? 0)} doubles average.`,
        score: 70,
      },
    ];
  }
  return [];
}

function nemesisInsight(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[]): Insight[] {
  const overall = computePlayerStats(playerId, matches);
  if (overall.played < MIN_SAMPLE_SIZE) return [];
  const nemesis = computeNemesis(playerId, roster, matches);
  if (!nemesis) return [];
  const diff = (overall.winRate ?? 0) - (nemesis.headToHead.winRate ?? 0);
  if (diff >= NOTABLE_GAP + 0.05) {
    return [
      {
        id: `struggle-vs-${nemesis.opponentId}`,
        text: `You struggle against ${nemesis.opponentName} -- just a ${pct(nemesis.headToHead.winRate ?? 0)} win rate across ${nemesis.headToHead.played} matches, your toughest matchup.`,
        score: 70,
      },
    ];
  }
  return [];
}

/** Compares goal-margin consistency in the first half of a player's history against the second half -- an honest before/after trend, not an absolute judgment. */
function consistencyTrendInsight(playerId: string, matches: MatchSummary[]): Insight[] {
  const ordered = matches
    .filter((m) => findSides(playerId, m) !== null)
    .slice()
    .sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime());
  if (ordered.length < MIN_SAMPLE_SIZE * 2) return [];

  const mid = Math.floor(ordered.length / 2);
  const earlier = computeConsistency(playerId, ordered.slice(0, mid));
  const recent = computeConsistency(playerId, ordered.slice(mid));
  if (earlier.goalMarginStdDev === null || recent.goalMarginStdDev === null) return [];

  const diff = earlier.goalMarginStdDev - recent.goalMarginStdDev;
  if (diff >= 0.5) {
    return [
      {
        id: "consistency-improving",
        text: "You've become more consistent recently -- your results swing less between blowouts and nail-biters than they used to.",
        score: 50,
      },
    ];
  }
  if (diff <= -0.5) {
    return [
      {
        id: "consistency-declining",
        text: "Your results have gotten less predictable recently -- bigger swings between big wins and big losses.",
        score: 40,
      },
    ];
  }
  return [];
}

/** Every honestly-derivable trend insight currently true for this player. Unsorted -- callers should sort by score descending before display. */
export function generateInsights(playerId: string, roster: MatchSidePlayer[], matches: MatchSummary[]): Insight[] {
  return [
    ...formTrendInsight(playerId, matches),
    ...matchTypeInsight(playerId, matches),
    ...partnershipInsight(playerId, matches),
    ...nemesisInsight(playerId, roster, matches),
    ...consistencyTrendInsight(playerId, matches),
  ];
}
