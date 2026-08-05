import type { MatchSidePlayer, MatchSummary } from "./matches";
import { computeConsistency, computeDoublesPartnerships, computeFormTrend, computeMatchTypeSplit, computeNemesis, computePlayerStats, findSides, MIN_SAMPLE_SIZE } from "./stats";

export interface Insight {
  id: string;
  /** Translation key + params -- the UI calls t(textKey, textParams); this module never produces English text directly. */
  textKey: string;
  textParams: Record<string, string | number>;
  /** Rough interestingness score for ranking when multiple insights are available -- higher surfaces first. */
  score: number;
}

/** The bar for "clearly" better/worse rather than noise -- 15 percentage points. */
const NOTABLE_GAP = 0.15;

function pct(rate: number): number {
  return Math.round(rate * 100);
}

function formTrendInsight(playerId: string, matches: MatchSummary[]): Insight[] {
  const { trend, recentWinRate, previousWinRate } = computeFormTrend(playerId, matches, 5);
  if (trend === null || trend === "stable" || recentWinRate === null || previousWinRate === null) return [];
  if (trend === "improving") {
    return [
      {
        id: "form-improving",
        textKey: "insights.formImproving",
        textParams: { recent: pct(recentWinRate), previous: pct(previousWinRate) },
        score: 75,
      },
    ];
  }
  return [
    {
      id: "form-declining",
      textKey: "insights.formDeclining",
      textParams: { recent: pct(recentWinRate), previous: pct(previousWinRate) },
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
    return [{ id: "better-in-doubles", textKey: "insights.betterInDoubles", textParams: { doubles: pct(doublesRate), singles: pct(singlesRate) }, score: 65 }];
  }
  if (-diff >= NOTABLE_GAP) {
    return [{ id: "better-in-singles", textKey: "insights.betterInSingles", textParams: { singles: pct(singlesRate), doubles: pct(doublesRate) }, score: 65 }];
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
        textKey: "insights.strongestPartnership",
        textParams: { name: best.teammateName, together: pct(best.winRate ?? 0), average: pct(overallDoubles.winRate ?? 0) },
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
        textKey: "insights.struggleVs",
        textParams: { name: nemesis.opponentName, rate: pct(nemesis.headToHead.winRate ?? 0), played: nemesis.headToHead.played },
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
        textKey: "insights.consistencyImproving",
        textParams: {},
        score: 50,
      },
    ];
  }
  if (diff <= -0.5) {
    return [
      {
        id: "consistency-declining",
        textKey: "insights.consistencyDeclining",
        textParams: {},
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
