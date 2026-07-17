import { DEFAULT_MATCH_FILTERS, distinctClubs, filterMatches, hasActiveFilters, type MatchFilters } from "../src/lib/matchFilters";
import type { MatchSummary } from "../src/lib/matches";

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
  club?: { id: string; name: string } | null;
}

function makeMatch(
  side1: SideSpec,
  side2: SideSpec,
  opts?: { matchType?: "singles" | "doubles"; playedAt?: string },
): MatchSummary {
  const toSide = (spec: SideSpec, sideNumber: 1 | 2) => ({
    id: `side-${sideNumber}-${Math.random()}`,
    side_number: sideNumber,
    score: spec.score,
    penalty_score: null,
    result: spec.result,
    club: spec.club ?? null,
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

function filters(overrides: Partial<MatchFilters>): MatchFilters {
  return { ...DEFAULT_MATCH_FILTERS, ...overrides };
}

describe("filterMatches", () => {
  it("returns every match when no filters are active", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeMatch({ playerIds: ["p3"], score: 1, result: "win" }, { playerIds: ["p4"], score: 0, result: "loss" }),
    ];
    expect(filterMatches(matches, DEFAULT_MATCH_FILTERS)).toHaveLength(2);
  });

  it("filters by player, matching either side", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeMatch({ playerIds: ["p2"], score: 1, result: "win" }, { playerIds: ["p3"], score: 0, result: "loss" }),
      makeMatch({ playerIds: ["p4"], score: 1, result: "win" }, { playerIds: ["p5"], score: 0, result: "loss" }),
    ];
    expect(filterMatches(matches, filters({ playerId: "p2" }))).toHaveLength(2);
  });

  it("filters by opponent only in combination with a player", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p3"], score: 1, result: "win" }),
    ];
    const rows = filterMatches(matches, filters({ playerId: "p1", opponentId: "p2" }));
    expect(rows).toHaveLength(1);
    // opponentId alone (no playerId) is a no-op, not an error.
    expect(filterMatches(matches, filters({ opponentId: "p2" }))).toHaveLength(2);
  });

  it("filters by club on either side", () => {
    const barca = { id: "c1", name: "Barcelona" };
    const madrid = { id: "c2", name: "Real Madrid" };
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win", club: barca }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss", club: madrid }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
    ];
    expect(filterMatches(matches, filters({ clubId: "c2" }))).toHaveLength(1);
  });

  it("filters by match type", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { matchType: "singles" }),
      makeMatch(
        { playerIds: ["p1", "p3"], score: 1, result: "win" },
        { playerIds: ["p2", "p4"], score: 0, result: "loss" },
        { matchType: "doubles" },
      ),
    ];
    expect(filterMatches(matches, filters({ matchType: "doubles" }))).toHaveLength(1);
  });

  it("filters by result relative to the selected player, and draws absolutely", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "loss" }, { playerIds: ["p2"], score: 2, result: "win" }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "draw" }, { playerIds: ["p2"], score: 1, result: "draw" }),
    ];
    expect(filterMatches(matches, filters({ playerId: "p1", result: "win" }))).toHaveLength(1);
    expect(filterMatches(matches, filters({ playerId: "p1", result: "loss" }))).toHaveLength(1);
    expect(filterMatches(matches, filters({ result: "draw" }))).toHaveLength(1);
  });

  it("filters by date range relative to an injected 'now'", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");
    const recent = new Date(now.getTime() - 3 * 86_400_000).toISOString();
    const old = new Date(now.getTime() - 40 * 86_400_000).toISOString();
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: recent }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: old }),
    ];
    expect(filterMatches(matches, filters({ dateRange: "7" }), now)).toHaveLength(1);
    expect(filterMatches(matches, filters({ dateRange: "90" }), now)).toHaveLength(2);
  });

  it("filters by free-text search across player and club names", () => {
    const matches = [
      makeMatch(
        { playerIds: ["Alice"], score: 1, result: "win", club: { id: "c1", name: "Barcelona" } },
        { playerIds: ["Bob"], score: 0, result: "loss" },
      ),
      makeMatch({ playerIds: ["Carol"], score: 1, result: "win" }, { playerIds: ["Dave"], score: 0, result: "loss" }),
    ];
    expect(filterMatches(matches, filters({ search: "barcelona" }))).toHaveLength(1);
    expect(filterMatches(matches, filters({ search: "bob" }))).toHaveLength(1);
    expect(filterMatches(matches, filters({ search: "nobody" }))).toHaveLength(0);
  });

  it("combines every active filter with AND semantics", () => {
    const matches = [
      // Matches every filter below.
      makeMatch(
        { playerIds: ["p1"], score: 2, result: "win", club: { id: "c1", name: "Barcelona" } },
        { playerIds: ["p2"], score: 1, result: "loss" },
        { matchType: "singles" },
      ),
      // Wrong club -- fails the clubId filter even though player/result/type all match.
      makeMatch(
        { playerIds: ["p1"], score: 2, result: "win", club: { id: "c2", name: "Real Madrid" } },
        { playerIds: ["p2"], score: 1, result: "loss" },
        { matchType: "singles" },
      ),
      // Wrong match type -- fails the matchType filter.
      makeMatch(
        { playerIds: ["p1", "p3"], score: 2, result: "win", club: { id: "c1", name: "Barcelona" } },
        { playerIds: ["p2", "p4"], score: 1, result: "loss" },
        { matchType: "doubles" },
      ),
    ];
    const rows = filterMatches(matches, filters({ playerId: "p1", result: "win", clubId: "c1", matchType: "singles" }));
    expect(rows).toHaveLength(1);
  });
});

describe("hasActiveFilters", () => {
  it("is false only when every filter is at its default", () => {
    expect(hasActiveFilters(DEFAULT_MATCH_FILTERS)).toBe(false);
    expect(hasActiveFilters(filters({ search: "x" }))).toBe(true);
    expect(hasActiveFilters(filters({ playerId: "p1" }))).toBe(true);
  });
});

describe("distinctClubs", () => {
  it("collects unique clubs from either side, sorted by name", () => {
    const matches = [
      makeMatch(
        { playerIds: ["p1"], score: 1, result: "win", club: { id: "c2", name: "Real Madrid" } },
        { playerIds: ["p2"], score: 0, result: "loss", club: { id: "c1", name: "Barcelona" } },
      ),
      makeMatch(
        { playerIds: ["p1"], score: 1, result: "win", club: { id: "c2", name: "Real Madrid" } },
        { playerIds: ["p2"], score: 0, result: "loss" },
      ),
    ];
    expect(distinctClubs(matches)).toEqual([
      { id: "c1", name: "Barcelona" },
      { id: "c2", name: "Real Madrid" },
    ]);
  });
});
