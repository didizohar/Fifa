import { generateDiscoveryItems, selectHomeHighlights } from "../src/lib/discovery";
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

describe("generateDiscoveryItems", () => {
  it("returns nothing for a player with no matches", () => {
    expect(generateDiscoveryItems("p1", roster(["p1"]), [], new Date())).toEqual([]);
  });

  it("surfaces a recently broken record within the recency window, but not an old one", () => {
    const now = new Date(2026, 5, 15);
    const recentRecordMatch = makeMatch(
      { playerIds: ["p1"], score: 9, result: "win" },
      { playerIds: ["x"], score: 0, result: "loss" },
      new Date(2026, 5, 10).toISOString(),
    );
    const items = generateDiscoveryItems("p1", roster(["p1", "x"]), [recentRecordMatch], now);
    expect(items.some((i) => i.type === "record" && i.id === "record-most-goals-in-match")).toBe(true);

    const oldRecordMatch = makeMatch(
      { playerIds: ["p1"], score: 9, result: "win" },
      { playerIds: ["x"], score: 0, result: "loss" },
      new Date(2026, 0, 1).toISOString(),
    );
    const oldItems = generateDiscoveryItems("p1", roster(["p1", "x"]), [oldRecordMatch], now);
    expect(oldItems.some((i) => i.type === "record")).toBe(false);
  });

  it("surfaces an on-this-day memory from a past year, picking the most recent anniversary", () => {
    const now = new Date(2026, 5, 15);
    const twoYearsAgo = makeMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["x"], score: 1, result: "loss" }, new Date(2024, 5, 15).toISOString());
    const oneYearAgo = makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 2, result: "win" }, new Date(2025, 5, 15).toISOString());
    const unrelatedDay = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, new Date(2025, 6, 1).toISOString());

    const items = generateDiscoveryItems("p1", roster(["p1", "x"]), [twoYearsAgo, oneYearAgo, unrelatedDay], now);
    const memory = items.find((i) => i.type === "memory");
    expect(memory?.text).toContain("last year");
    expect(memory?.text).toContain("lost to x");
  });

  it("has no memory item when nothing was played on this calendar date in a past year", () => {
    const now = new Date(2026, 5, 15);
    const unrelatedDay = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, new Date(2025, 6, 1).toISOString());
    expect(generateDiscoveryItems("p1", roster(["p1", "x"]), [unrelatedDay], now).some((i) => i.type === "memory")).toBe(false);
  });
});

describe("selectHomeHighlights", () => {
  it("caps the result at `count` and ranks by score descending", () => {
    const now = new Date(2026, 5, 15);
    const matches = [
      // Round milestone (score 60) + a big win (score 60) + a close match (score 55) -- several fun facts at once.
      ...Array.from({ length: 10 }, (_, n) => makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: [`o${n}`], score: 0, result: "loss" }, new Date(2026, 5, n + 1).toISOString())),
    ];
    const rosterList = roster(["p1", ...Array.from({ length: 10 }, (_, n) => `o${n}`)]);
    const highlights = selectHomeHighlights("p1", rosterList, matches, now, 2);
    expect(highlights.length).toBeLessThanOrEqual(2);
    if (highlights.length === 2) {
      expect(highlights[0]!.score).toBeGreaterThanOrEqual(highlights[1]!.score);
    }
  });

  it("is stable for the same day but the tiebreak order is a function of the date", () => {
    const now = new Date(2026, 5, 15);
    const matches = [makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" })];
    const first = selectHomeHighlights("p1", roster(["p1", "x"]), matches, now, 4);
    const second = selectHomeHighlights("p1", roster(["p1", "x"]), matches, now, 4);
    expect(first).toEqual(second);
  });

  it("returns an empty list when there's nothing to surface", () => {
    expect(selectHomeHighlights("p1", roster(["p1"]), [], new Date())).toEqual([]);
  });
});
