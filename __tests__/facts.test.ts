import { generateFunFacts } from "../src/lib/facts";
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

describe("generateFunFacts", () => {
  it("returns no facts for a player with no matches", () => {
    expect(generateFunFacts("p1", roster(["p1"]), [])).toEqual([]);
  });

  it("surfaces a current win streak, flagging a career-best streak distinctly", () => {
    const matches = [0, 1, 2].map((n) =>
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(n) }),
    );
    const facts = generateFunFacts("p1", roster(["p1", "x"]), matches);
    const streakFact = facts.find((f) => f.id === "streak-win-3");
    expect(streakFact?.text).toContain("longest of your career");
  });

  it("does not report a streak for a career-best that's shorter than the qualifying threshold", () => {
    const matches = [0, 1].map((n) =>
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(n) }),
    );
    expect(generateFunFacts("p1", roster(["p1", "x"]), matches).some((f) => f.id.startsWith("streak-win"))).toBe(false);
  });

  it("never reports round-number milestone facts -- those belong to achievements.ts, so they aren't announced twice", () => {
    const matches = Array.from({ length: 100 }, (_, n) =>
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: [`o${n}`], score: 0, result: "loss" }, { playedAt: day(n) }),
    );
    const facts = generateFunFacts("p1", roster(["p1", ...Array.from({ length: 100 }, (_, n) => `o${n}`)]), matches);
    expect(facts.some((f) => f.id.startsWith("milestone-"))).toBe(false);
  });

  it("reports never-beaten and never-lost-to rivalry facts", () => {
    const matches = [
      ...[0, 1, 2].map((n) => makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["nemesis"], score: 1, result: "win" }, { playedAt: day(n) })),
      ...[3, 4, 5].map((n) => makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["victim"], score: 0, result: "loss" }, { playedAt: day(n) })),
    ];
    const facts = generateFunFacts("p1", roster(["p1", "nemesis", "victim"]), matches);
    expect(facts.some((f) => f.id === "never-beaten-nemesis")).toBe(true);
    expect(facts.some((f) => f.id === "never-lost-to-victim")).toBe(true);
  });

  it("reports the closest-ever match only when the margin is 0 or 1", () => {
    const closeMatch = makeMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["x"], score: 1, result: "loss" }, { playedAt: day(0) });
    const facts = generateFunFacts("p1", roster(["p1", "x"]), [closeMatch]);
    expect(facts.some((f) => f.id === `closest-match-${closeMatch.id}`)).toBe(true);
  });

  it("does not report a closest match when the smallest margin is still large", () => {
    const blowout = makeMatch({ playerIds: ["p1"], score: 5, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" });
    expect(generateFunFacts("p1", roster(["p1", "x"]), [blowout]).some((f) => f.id.startsWith("closest-match"))).toBe(false);
  });

  it("reports the biggest-ever win only when the margin is at least 3", () => {
    const bigWin = makeMatch({ playerIds: ["p1"], score: 5, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" });
    const facts = generateFunFacts("p1", roster(["p1", "x"]), [bigWin]);
    expect(facts.some((f) => f.id === `biggest-win-${bigWin.id}`)).toBe(true);
  });

  it("reports a favorite doubles partner once the sample size qualifies", () => {
    const matches = [0, 1, 2].map((n) =>
      makeMatch({ playerIds: ["p1", "mate"], score: 2, result: "win" }, { playerIds: ["x", "y"], score: 1, result: "loss" }, { matchType: "doubles", playedAt: day(n) }),
    );
    const facts = generateFunFacts("p1", roster(["p1", "mate", "x", "y"]), matches);
    expect(facts.some((f) => f.id === "favorite-partner-mate")).toBe(true);
  });

  it("reports a goal-difference fact phrased as 'your side', not 'you', for doubles", () => {
    const withMate = [0, 1, 2].map((n) =>
      makeMatch({ playerIds: ["p1", "mate"], score: 4, result: "win" }, { playerIds: ["x", "y"], score: 1, result: "loss" }, { matchType: "doubles", playedAt: day(n) }),
    );
    const withoutMate = [3, 4, 5].map((n) =>
      makeMatch({ playerIds: ["p1", "other"], score: 1, result: "loss" }, { playerIds: ["x", "y"], score: 2, result: "win" }, { matchType: "doubles", playedAt: day(n) }),
    );
    const facts = generateFunFacts("p1", roster(["p1", "mate", "other", "x", "y"]), [...withMate, ...withoutMate]);
    const goalFact = facts.find((f) => f.id === "partner-goal-diff-mate");
    expect(goalFact?.text).toContain("Your side scores");
    expect(goalFact?.text).not.toMatch(/^You score/);
  });
});
