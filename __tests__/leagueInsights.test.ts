import { generateLeagueInsights, selectInsightOfTheDay } from "../src/lib/leagueInsights";
import type { MatchSidePlayer, MatchSummary } from "../src/lib/matches";

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
}

function makeMatch(side1: SideSpec, side2: SideSpec, playedAt?: string): MatchSummary {
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
    played_at: playedAt ?? new Date().toISOString(),
    sides: [toSide(side1, 1), toSide(side2, 2)],
  };
}

function roster(ids: string[]): MatchSidePlayer[] {
  return ids.map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" }));
}

describe("generateLeagueInsights", () => {
  it("returns nothing for an empty league", () => {
    expect(generateLeagueInsights([], [], new Date())).toEqual([]);
  });

  it("surfaces a hot-form insight for a player who's won most of their last 10", () => {
    const now = new Date(2026, 5, 15);
    const matches = [
      ...Array.from({ length: 8 }, (_, n) => makeMatch({ playerIds: ["daniel"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, new Date(2026, 5, n + 1).toISOString())),
      ...Array.from({ length: 2 }, (_, n) => makeMatch({ playerIds: ["daniel"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, new Date(2026, 5, n + 9).toISOString())),
    ];
    const items = generateLeagueInsights(roster(["daniel", "x"]), matches, now);
    const hot = items.find((i) => i.id === "hot-form-daniel");
    expect(hot?.textKey).toBe("leagueInsights.hotForm");
    expect(hot?.textParams).toEqual({ name: "daniel", wins: 8, matches: 10 });
  });

  it("does not surface hot form for a player with fewer than 10 matches", () => {
    const now = new Date(2026, 5, 15);
    const matches = Array.from({ length: 5 }, (_, n) => makeMatch({ playerIds: ["daniel"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, new Date(2026, 5, n + 1).toISOString()));
    expect(generateLeagueInsights(roster(["daniel", "x"]), matches, now).some((i) => i.id === "hot-form-daniel")).toBe(false);
  });

  it("surfaces a dormant-rivalry insight once a pair hasn't played in at least 14 days", () => {
    const now = new Date(2026, 5, 15);
    const matches = [makeMatch({ playerIds: ["didi"], score: 1, result: "win" }, { playerIds: ["omer"], score: 0, result: "loss" }, new Date(2026, 4, 25).toISOString())];
    const items = generateLeagueInsights(roster(["didi", "omer"]), matches, now);
    const dormant = items.find((i) => i.id === "dormant-rivalry-didi-omer");
    expect(dormant?.textKey).toBe("leagueInsights.dormantRivalry");
    expect(dormant?.textParams).toEqual({ nameA: "didi", nameB: "omer", days: 21 });
  });

  it("does not surface a dormant rivalry for a pair who played recently", () => {
    const now = new Date(2026, 5, 15);
    const matches = [makeMatch({ playerIds: ["didi"], score: 1, result: "win" }, { playerIds: ["omer"], score: 0, result: "loss" }, new Date(2026, 5, 14).toISOString())];
    expect(generateLeagueInsights(roster(["didi", "omer"]), matches, now).some((i) => i.id.startsWith("dormant-rivalry-"))).toBe(false);
  });

  it("does not surface a dormant rivalry for a pair who has never played", () => {
    const now = new Date(2026, 5, 15);
    expect(generateLeagueInsights(roster(["didi", "omer"]), [], now).some((i) => i.id.startsWith("dormant-rivalry-"))).toBe(false);
  });

  it("surfaces the one-goal-margin insight when most of this month's matches were decided by one goal", () => {
    const now = new Date(2026, 5, 15);
    const matches = Array.from({ length: 4 }, (_, n) => makeMatch({ playerIds: ["a"], score: 2, result: "win" }, { playerIds: ["b"], score: 1, result: "loss" }, new Date(2026, 5, n + 1).toISOString()));
    const items = generateLeagueInsights(roster(["a", "b"]), matches, now);
    expect(items.some((i) => i.textKey === "leagueInsights.oneGoalMargin")).toBe(true);
  });

  it("does not surface the one-goal-margin insight when most matches had a bigger margin", () => {
    const now = new Date(2026, 5, 15);
    const matches = Array.from({ length: 4 }, (_, n) => makeMatch({ playerIds: ["a"], score: 5, result: "win" }, { playerIds: ["b"], score: 0, result: "loss" }, new Date(2026, 5, n + 1).toISOString()));
    expect(generateLeagueInsights(roster(["a", "b"]), matches, now).some((i) => i.textKey === "leagueInsights.oneGoalMargin")).toBe(false);
  });

  it("does not surface the one-goal-margin insight below the minimum sample size", () => {
    const now = new Date(2026, 5, 15);
    const matches = [makeMatch({ playerIds: ["a"], score: 2, result: "win" }, { playerIds: ["b"], score: 1, result: "loss" }, new Date(2026, 5, 1).toISOString())];
    expect(generateLeagueInsights(roster(["a", "b"]), matches, now).some((i) => i.textKey === "leagueInsights.oneGoalMargin")).toBe(false);
  });
});

describe("selectInsightOfTheDay", () => {
  it("returns null when there's nothing to surface", () => {
    expect(selectInsightOfTheDay([], [], new Date())).toBeNull();
  });

  it("is stable for the same day", () => {
    const now = new Date(2026, 5, 15);
    const matches = [makeMatch({ playerIds: ["didi"], score: 1, result: "win" }, { playerIds: ["omer"], score: 0, result: "loss" }, new Date(2026, 4, 1).toISOString())];
    const first = selectInsightOfTheDay(roster(["didi", "omer"]), matches, now);
    const second = selectInsightOfTheDay(roster(["didi", "omer"]), matches, now);
    expect(first).toEqual(second);
  });

  it("picks the highest-scoring insight when there are several", () => {
    const now = new Date(2026, 5, 15);
    const matches = [
      // Dormant rivalry just past the 14-day threshold (score ~60) plus a hot-form streak (score 78) -- hot form should win.
      makeMatch({ playerIds: ["didi"], score: 1, result: "win" }, { playerIds: ["omer"], score: 0, result: "loss" }, new Date(2026, 4, 26).toISOString()),
      ...Array.from({ length: 10 }, (_, n) => makeMatch({ playerIds: ["daniel"], score: 1, result: "win" }, { playerIds: [`o${n}`], score: 0, result: "loss" }, new Date(2026, 5, n + 1).toISOString())),
    ];
    const rosterList = roster(["didi", "omer", "daniel", ...Array.from({ length: 10 }, (_, n) => `o${n}`)]);
    const best = selectInsightOfTheDay(rosterList, matches, now);
    expect(best?.id).toBe("hot-form-daniel");
  });
});
