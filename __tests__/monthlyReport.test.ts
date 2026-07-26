import { computeMonthlyReport } from "../src/lib/monthlyReport";
import type { MatchSidePlayer, MatchSummary } from "../src/lib/matches";

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
}

function makeMatch(side1: SideSpec, side2: SideSpec, playedAt: string, matchType: "singles" | "doubles" = "singles"): MatchSummary {
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
    match_type: matchType,
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

describe("computeMonthlyReport", () => {
  it("reports zero matches and no awards for an empty month", () => {
    const report = computeMonthlyReport(roster(["p1"]), [], 2026, 2);
    expect(report.matchesPlayed).toBe(0);
    expect(report.awards).toEqual([]);
    expect(report.story).toContain("0 matches");
  });

  it("computes Player of the Month, Top Scorer, and Most Active from matches in the given month only", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 4, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, new Date(2026, 2, 5).toISOString()),
      makeMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }, new Date(2026, 2, 10).toISOString()),
      // Outside the target month -- must not count.
      makeMatch({ playerIds: ["p2"], score: 5, result: "win" }, { playerIds: ["p1"], score: 0, result: "loss" }, new Date(2026, 1, 1).toISOString()),
    ];
    const report = computeMonthlyReport(roster(["p1", "p2"]), matches, 2026, 2);
    expect(report.matchesPlayed).toBe(2);
    expect(report.awards.find((a) => a.id === "player-of-month")?.holderName).toBe("p1");
    expect(report.awards.find((a) => a.id === "top-scorer")).toMatchObject({ holderName: "p1", valueLabel: "7 goals" });
    expect(report.awards.find((a) => a.id === "most-active")).toMatchObject({ holderName: "p1", valueLabel: "2 matches" });
  });

  it("computes Best Partnership from doubles matches within the month", () => {
    const matches = [
      makeMatch({ playerIds: ["p1", "mate"], score: 1, result: "win" }, { playerIds: ["x", "y"], score: 0, result: "loss" }, new Date(2026, 2, 1).toISOString(), "doubles"),
      makeMatch({ playerIds: ["p1", "mate"], score: 1, result: "win" }, { playerIds: ["x", "y"], score: 0, result: "loss" }, new Date(2026, 2, 2).toISOString(), "doubles"),
    ];
    const report = computeMonthlyReport(roster(["p1", "mate", "x", "y"]), matches, 2026, 2);
    // computeBestDoublesPairs sorts pair members by id, so "mate" sorts before "p1".
    expect(report.awards.find((a) => a.id === "best-partnership")).toMatchObject({ holderName: "mate & p1" });
  });

  it("computes Most Improved by comparing win rate against the prior month, only when both months have enough matches", () => {
    const priorMonth = [
      makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, new Date(2026, 1, 1).toISOString()),
      makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, new Date(2026, 1, 2).toISOString()),
    ];
    const thisMonth = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, new Date(2026, 2, 1).toISOString()),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, new Date(2026, 2, 2).toISOString()),
    ];
    const report = computeMonthlyReport(roster(["p1", "x"]), [...priorMonth, ...thisMonth], 2026, 2);
    expect(report.awards.find((a) => a.id === "most-improved")).toMatchObject({ holderName: "p1", valueLabel: "+100 pts win rate" });
  });

  it("includes records whose setAt falls in the target month", () => {
    const matches = [makeMatch({ playerIds: ["p1"], score: 9, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, new Date(2026, 2, 5).toISOString())];
    const report = computeMonthlyReport(roster(["p1", "x"]), matches, 2026, 2);
    expect(report.recordsBroken.some((r) => r.id === "most-goals-in-match")).toBe(true);
    expect(report.story).toContain("record");
  });
});
