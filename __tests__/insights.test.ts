import { generateInsights } from "../src/lib/insights";
import type { MatchSidePlayer, MatchSummary } from "../src/lib/matches";

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
}

function makeMatch(side1: SideSpec, side2: SideSpec, opts?: { matchType?: "singles" | "doubles"; playedAt?: string }): MatchSummary {
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
    match_type: opts?.matchType ?? "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: opts?.playedAt ?? new Date().toISOString(),
    sides: [toSide(side1, 1), toSide(side2, 2)],
  };
}

function roster(ids: string[]): MatchSidePlayer[] {
  return ids.map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" }));
}

const base = Date.now();
const day = (n: number) => new Date(base + n * 86_400_000).toISOString();

describe("generateInsights", () => {
  it("returns no insights for a player with no matches", () => {
    expect(generateInsights("p1", roster(["p1"]), [])).toEqual([]);
  });

  it("detects an improving form trend", () => {
    const older = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(0) }),
      makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, { playedAt: day(1) }),
      makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, { playedAt: day(2) }),
      makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, { playedAt: day(3) }),
      makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, { playedAt: day(4) }),
    ];
    const recent = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(5) }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(6) }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(7) }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(8) }),
      makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, { playedAt: day(9) }),
    ];
    const insights = generateInsights("p1", roster(["p1", "x"]), [...older, ...recent]);
    expect(insights.some((i) => i.id === "form-improving")).toBe(true);
  });

  it("detects a much-better-in-doubles trend", () => {
    const singlesMatches = [0, 1, 2].map((n) =>
      makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, { matchType: "singles", playedAt: day(n) }),
    );
    const doublesMatches = [3, 4, 5].map((n) =>
      makeMatch({ playerIds: ["p1", "mate"], score: 1, result: "win" }, { playerIds: ["x", "y"], score: 0, result: "loss" }, { matchType: "doubles", playedAt: day(n) }),
    );
    const insights = generateInsights("p1", roster(["p1", "mate", "x", "y"]), [...singlesMatches, ...doublesMatches]);
    expect(insights.some((i) => i.id === "better-in-doubles")).toBe(true);
  });

  it("detects a standout partnership above the player's doubles average", () => {
    const withMate = [0, 1, 2].map((n) =>
      makeMatch({ playerIds: ["p1", "mate"], score: 1, result: "win" }, { playerIds: ["x", "y"], score: 0, result: "loss" }, { matchType: "doubles", playedAt: day(n) }),
    );
    const withOther = [3, 4, 5].map((n) =>
      makeMatch({ playerIds: ["p1", "other"], score: 0, result: "loss" }, { playerIds: ["x", "y"], score: 1, result: "win" }, { matchType: "doubles", playedAt: day(n) }),
    );
    const insights = generateInsights("p1", roster(["p1", "mate", "other", "x", "y"]), [...withMate, ...withOther]);
    expect(insights.some((i) => i.id === "strongest-partnership-mate")).toBe(true);
  });

  it("detects a nemesis matchup well below the player's overall win rate", () => {
    const vsNemesis = [0, 1, 2].map((n) =>
      makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["nemesis"], score: 1, result: "win" }, { playedAt: day(n) }),
    );
    const easyWins = [3, 4, 5, 6, 7].map((n, i) =>
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: [`o${i}`], score: 0, result: "loss" }, { playedAt: day(n) }),
    );
    const insights = generateInsights("p1", roster(["p1", "nemesis", "o0", "o1", "o2", "o3", "o4"]), [...vsNemesis, ...easyWins]);
    expect(insights.some((i) => i.id === "struggle-vs-nemesis")).toBe(true);
  });

  it("detects an improving consistency trend between the earlier and later halves of a player's history", () => {
    const earlier = [
      makeMatch({ playerIds: ["p1"], score: 6, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(0) }),
      makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 6, result: "win" }, { playedAt: day(1) }),
      makeMatch({ playerIds: ["p1"], score: 6, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(2) }),
    ];
    const recent = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(3) }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(4) }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(5) }),
    ];
    const insights = generateInsights("p1", roster(["p1", "x"]), [...earlier, ...recent]);
    expect(insights.some((i) => i.id === "consistency-improving")).toBe(true);
  });

  it("stays quiet when nothing clears the notable-gap threshold", () => {
    // Roughly even singles/doubles performance, no nemesis, no partnership standout, no trend.
    const matches = [0, 1, 2, 3].map((n) =>
      makeMatch({ playerIds: ["p1"], score: 1, result: n % 2 === 0 ? "win" : "loss" }, { playerIds: ["x"], score: 1, result: n % 2 === 0 ? "loss" : "win" }, { playedAt: day(n) }),
    );
    expect(generateInsights("p1", roster(["p1", "x"]), matches)).toEqual([]);
  });
});
