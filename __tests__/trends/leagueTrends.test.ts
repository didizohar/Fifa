import { calculateAllPlayerTrends, calculateLeagueTrendSummary } from "../../src/lib/trends/leagueTrends";
import type { MatchSidePlayer, MatchSummary } from "../../src/lib/matches";

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
}

function makeMatch(side1: SideSpec, side2: SideSpec, playedAt: string): MatchSummary {
  const toSide = (spec: SideSpec, sideNumber: 1 | 2) => ({
    id: `side-${sideNumber}-${Math.random()}`,
    side_number: sideNumber,
    score: spec.score,
    penalty_score: null,
    result: spec.result,
    club: null,
    players: spec.playerIds.map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" })),
  });
  return {
    id: `match-${Math.random()}`,
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: playedAt,
    sides: [toSide(side1, 1), toSide(side2, 2)],
  };
}

function roster(ids: string[]): MatchSidePlayer[] {
  return ids.map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" }));
}

const win = (playerIds: string[], score: number): SideSpec => ({ playerIds, score, result: "win" });
const loss = (playerIds: string[], score: number): SideSpec => ({ playerIds, score, result: "loss" });

function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

describe("calculateAllPlayerTrends", () => {
  const now = new Date(2026, 6, 27, 12);

  it("returns one trend per roster member, in roster order", () => {
    const matches = Array.from({ length: 10 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), daysAgo(now, i)));
    const trends = calculateAllPlayerTrends(roster(["a", "b", "c"]), matches, now);
    expect(trends.map((t) => t.playerId)).toEqual(["a", "b", "c"]);
  });

  it("returns insufficientData for a roster member with an empty history, without throwing", () => {
    expect(() => calculateAllPlayerTrends(roster(["a"]), [], now)).not.toThrow();
    expect(calculateAllPlayerTrends(roster(["a"]), [], now)[0]!.direction).toBe("insufficientData");
  });
});

describe("calculateLeagueTrendSummary", () => {
  const now = new Date(2026, 6, 27, 12);

  it("returns every field null for an empty roster or empty history", () => {
    const summary = calculateLeagueTrendSummary(roster(["a", "b"]), [], now);
    expect(summary).toEqual({
      hotPlayer: null,
      coldPlayer: null,
      biggestImprovement: null,
      biggestDecline: null,
      mostConsistent: null,
      mostActive: null,
      bestAttack: null,
      bestDefence: null,
    });
  });

  it("never selects a player with insufficientData for any card", () => {
    // "a" has a rich history; "b" has almost none.
    const matches = [
      ...Array.from({ length: 10 }, (_, i) => makeMatch(win(["a"], 3), loss(["x"], 0), daysAgo(now, i))),
      makeMatch(win(["b"], 1), loss(["x"], 0), daysAgo(now, 0)),
    ];
    const summary = calculateLeagueTrendSummary(roster(["a", "b", "x"]), matches, now);
    for (const card of Object.values(summary)) {
      if (card) expect(card.direction).not.toBe("insufficientData");
    }
  });

  it("picks the hottest player as hotPlayer and the coldest as coldPlayer", () => {
    const hot = Array.from({ length: 10 }, (_, i) => makeMatch(win(["hot"], 3), loss(["x"], 0), daysAgo(now, i)));
    const cold = Array.from({ length: 10 }, (_, i) => makeMatch(loss(["cold"], 0), win(["x"], 3), daysAgo(now, i)));
    const summary = calculateLeagueTrendSummary(roster(["hot", "cold", "x"]), [...hot, ...cold], now);
    expect(summary.hotPlayer!.playerId).toBe("hot");
    expect(summary.coldPlayer!.playerId).toBe("cold");
  });

  it("breaks exact ties deterministically (more matches considered, then lowest playerId) instead of randomly", () => {
    // "b" and "c" have literally identical records against "x" -- a genuine tie on every score.
    const matchesFor = (id: string) => Array.from({ length: 10 }, (_, i) => makeMatch(win([id], 1), loss(["x"], 0), daysAgo(now, i)));
    const matches = [...matchesFor("b"), ...matchesFor("c")];
    const summaryForward = calculateLeagueTrendSummary(roster(["b", "c", "x"]), matches, now);
    const summaryReversed = calculateLeagueTrendSummary(roster(["c", "b", "x"]), [...matches].reverse(), now);
    // Same tie, same deterministic winner regardless of roster/match array order.
    expect(summaryForward.hotPlayer!.playerId).toBe(summaryReversed.hotPlayer!.playerId);
    expect(summaryForward.hotPlayer!.playerId).toBe("b"); // lowest playerId wins an exact tie
  });
});
