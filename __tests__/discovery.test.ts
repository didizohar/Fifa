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

/** Identity translator -- discovery.ts needs `t` to pre-resolve nested keys (a record's own label/value) into the composite item's params, so tests assert on keys/params directly rather than real translated text. */
const t = (key: string) => key;

describe("generateDiscoveryItems", () => {
  it("returns nothing for a player with no matches", () => {
    expect(generateDiscoveryItems("p1", roster(["p1"]), [], t, new Date())).toEqual([]);
  });

  it("surfaces a recently broken record within the recency window, but not an old one", () => {
    const now = new Date(2026, 5, 15);
    const recentRecordMatch = makeMatch(
      { playerIds: ["p1"], score: 9, result: "win" },
      { playerIds: ["x"], score: 0, result: "loss" },
      new Date(2026, 5, 10).toISOString(),
    );
    const items = generateDiscoveryItems("p1", roster(["p1", "x"]), [recentRecordMatch], t, now);
    expect(items.some((i) => i.type === "record" && i.id === "record-most-goals-in-match")).toBe(true);

    const oldRecordMatch = makeMatch(
      { playerIds: ["p1"], score: 9, result: "win" },
      { playerIds: ["x"], score: 0, result: "loss" },
      new Date(2026, 0, 1).toISOString(),
    );
    const oldItems = generateDiscoveryItems("p1", roster(["p1", "x"]), [oldRecordMatch], t, now);
    expect(oldItems.some((i) => i.type === "record")).toBe(false);
  });

  it("surfaces an on-this-day memory from a past year, picking the most recent anniversary", () => {
    const now = new Date(2026, 5, 15);
    const twoYearsAgo = makeMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["x"], score: 1, result: "loss" }, new Date(2024, 5, 15).toISOString());
    const oneYearAgo = makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 2, result: "win" }, new Date(2025, 5, 15).toISOString());
    const unrelatedDay = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, new Date(2025, 6, 1).toISOString());

    const items = generateDiscoveryItems("p1", roster(["p1", "x"]), [twoYearsAgo, oneYearAgo, unrelatedDay], t, now);
    const memory = items.find((i) => i.type === "memory");
    expect(memory?.textParams.time).toBe("discovery.memoryTimeLastYear");
    expect(memory?.textParams.result).toBe("discovery.resultLoss");
    expect(memory?.textParams.opponent).toBe("x");
  });

  it("has no memory item when nothing was played on this calendar date in a past year", () => {
    const now = new Date(2026, 5, 15);
    const unrelatedDay = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, new Date(2025, 6, 1).toISOString());
    expect(generateDiscoveryItems("p1", roster(["p1", "x"]), [unrelatedDay], t, now).some((i) => i.type === "memory")).toBe(false);
  });

  it("surfaces a recently unlocked achievement within the recency window, but not an old one", () => {
    const now = new Date(2026, 5, 15);
    const recentMatch = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, new Date(2026, 5, 10).toISOString());
    const items = generateDiscoveryItems("p1", roster(["p1", "x"]), [recentMatch], t, now);
    expect(items.some((i) => i.id === "achievement-first-match")).toBe(true);

    const oldMatch = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, new Date(2026, 0, 1).toISOString());
    const oldItems = generateDiscoveryItems("p1", roster(["p1", "x"]), [oldMatch], t, now);
    expect(oldItems.some((i) => i.id.startsWith("achievement-"))).toBe(false);
  });

  it("surfaces group rivalry trivia (most balanced / oldest) regardless of who's viewing", () => {
    const now = new Date(2026, 5, 15);
    const matches = [
      makeMatch({ playerIds: ["a"], score: 1, result: "win" }, { playerIds: ["b"], score: 0, result: "loss" }, new Date(2020, 0, 1).toISOString()),
      makeMatch({ playerIds: ["a"], score: 0, result: "loss" }, { playerIds: ["b"], score: 1, result: "win" }, new Date(2020, 0, 2).toISOString()),
      makeMatch({ playerIds: ["a"], score: 1, result: "win" }, { playerIds: ["b"], score: 0, result: "loss" }, new Date(2020, 0, 3).toISOString()),
    ];
    // Viewer "c" isn't part of the rivalry at all -- the trivia is about the group, not the viewer.
    const items = generateDiscoveryItems("c", roster(["a", "b", "c"]), matches, t, now);
    expect(items.some((i) => i.id.startsWith("rivalry-balanced-"))).toBe(true);
  });
});

describe("selectHomeHighlights", () => {
  it("caps the result at `count` and ranks by score descending", () => {
    const now = new Date(2026, 5, 15);
    const matches = [
      // A win streak plus a first-match/first-win achievement -- several discovery items at once, with different scores.
      ...Array.from({ length: 10 }, (_, n) => makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: [`o${n}`], score: 0, result: "loss" }, new Date(2026, 5, n + 1).toISOString())),
    ];
    const rosterList = roster(["p1", ...Array.from({ length: 10 }, (_, n) => `o${n}`)]);
    const highlights = selectHomeHighlights("p1", rosterList, matches, t, now, 2);
    expect(highlights.length).toBeLessThanOrEqual(2);
    if (highlights.length === 2) {
      expect(highlights[0]!.score).toBeGreaterThanOrEqual(highlights[1]!.score);
    }
  });

  it("is stable for the same day but the tiebreak order is a function of the date", () => {
    const now = new Date(2026, 5, 15);
    const matches = [makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" })];
    const first = selectHomeHighlights("p1", roster(["p1", "x"]), matches, t, now, 4);
    const second = selectHomeHighlights("p1", roster(["p1", "x"]), matches, t, now, 4);
    expect(first).toEqual(second);
  });

  it("returns an empty list when there's nothing to surface", () => {
    expect(selectHomeHighlights("p1", roster(["p1"]), [], t, new Date())).toEqual([]);
  });
});
