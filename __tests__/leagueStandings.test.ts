import {
  computeIndividualStandings,
  computeLeaguePoints,
  computePairStandings,
  filterMatchesForStandings,
  sortLeagueStandings,
  sortStandingsByMetric,
  type LeagueStandingRow,
} from "../src/lib/leagueStandings";
import type { MatchSidePlayer, MatchSummary } from "../src/lib/matches";

function player(id: string, name = id): MatchSidePlayer {
  return { id, display_name: name, avatar_url: null, custom_color: "#000" };
}

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
}

function makeMatch(side1: SideSpec, side2: SideSpec, playedAt: string, matchType: "singles" | "doubles" = "singles"): MatchSummary {
  const toSide = (spec: SideSpec, sideNumber: 1 | 2) => ({
    id: `side-${sideNumber}-${playedAt}-${spec.playerIds.join("")}`,
    side_number: sideNumber,
    score: spec.score,
    penalty_score: null,
    result: spec.result,
    club: null,
    players: spec.playerIds.map((id) => player(id)),
  });
  return {
    id: `match-${playedAt}-${side1.playerIds.join("")}-${side2.playerIds.join("")}`,
    match_type: matchType,
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: playedAt,
    sides: [toSide(side1, 1), toSide(side2, 2)],
  };
}

describe("computeLeaguePoints", () => {
  it.each([
    [0, 0, 0],
    [1, 0, 3],
    [0, 1, 1],
    [3, 2, 11],
    [5, 0, 15],
  ])("wins=%i draws=%i -> %i points", (wins, draws, expected) => {
    expect(computeLeaguePoints(wins, draws)).toBe(expected);
  });
});

describe("sortLeagueStandings", () => {
  const base: Omit<LeagueStandingRow, "id" | "name"> = {
    playerIds: [],
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    winRate: null,
  };

  it("orders by points descending first", () => {
    const rows: LeagueStandingRow[] = [
      { ...base, id: "a", name: "A", points: 3 },
      { ...base, id: "b", name: "B", points: 9 },
      { ...base, id: "c", name: "C", points: 6 },
    ];
    expect(sortLeagueStandings(rows).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks a points tie by goal difference", () => {
    const rows: LeagueStandingRow[] = [
      { ...base, id: "a", name: "A", points: 6, goalDifference: 2 },
      { ...base, id: "b", name: "B", points: 6, goalDifference: 5 },
    ];
    expect(sortLeagueStandings(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("breaks a points+goalDifference tie by goals for", () => {
    const rows: LeagueStandingRow[] = [
      { ...base, id: "a", name: "A", points: 6, goalDifference: 2, goalsFor: 10 },
      { ...base, id: "b", name: "B", points: 6, goalDifference: 2, goalsFor: 12 },
    ];
    expect(sortLeagueStandings(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("breaks a points+GD+GF tie by win rate", () => {
    const rows: LeagueStandingRow[] = [
      { ...base, id: "a", name: "A", points: 6, goalDifference: 2, goalsFor: 10, winRate: 0.4 },
      { ...base, id: "b", name: "B", points: 6, goalDifference: 2, goalsFor: 10, winRate: 0.6 },
    ];
    expect(sortLeagueStandings(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("breaks a points+GD+GF+winRate tie by wins", () => {
    const rows: LeagueStandingRow[] = [
      { ...base, id: "a", name: "A", points: 6, goalDifference: 2, goalsFor: 10, winRate: 0.5, wins: 2 },
      { ...base, id: "b", name: "B", points: 6, goalDifference: 2, goalsFor: 10, winRate: 0.5, wins: 3 },
    ];
    expect(sortLeagueStandings(rows).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("falls back to alphabetical order when every other field ties exactly", () => {
    const rows: LeagueStandingRow[] = [
      { ...base, id: "z", name: "Zack", points: 6, goalDifference: 2, goalsFor: 10, winRate: 0.5, wins: 2 },
      { ...base, id: "a", name: "Amir", points: 6, goalDifference: 2, goalsFor: 10, winRate: 0.5, wins: 2 },
    ];
    expect(sortLeagueStandings(rows).map((r) => r.id)).toEqual(["a", "z"]);
  });
});

describe("computeIndividualStandings", () => {
  const roster = [player("p1"), player("p2"), player("p3")];

  it("computes played/wins/draws/losses/points/goalsFor/goalsAgainst/goalDifference for each player", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }, "2026-03-01"),
      makeMatch({ playerIds: ["p1"], score: 2, result: "draw" }, { playerIds: ["p3"], score: 2, result: "draw" }, "2026-03-02"),
      makeMatch({ playerIds: ["p2"], score: 0, result: "loss" }, { playerIds: ["p3"], score: 1, result: "win" }, "2026-03-03"),
    ];
    const standings = computeIndividualStandings(roster, matches);

    const p1 = standings.find((r) => r.id === "p1")!;
    expect(p1).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 5, goalsAgainst: 3, goalDifference: 2, points: 4 });

    const p2 = standings.find((r) => r.id === "p2")!;
    expect(p2).toMatchObject({ played: 2, wins: 0, draws: 0, losses: 2, goalsFor: 1, goalsAgainst: 4, goalDifference: -3, points: 0 });

    const p3 = standings.find((r) => r.id === "p3")!;
    expect(p3).toMatchObject({ played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 3, goalsAgainst: 2, goalDifference: 1, points: 4 });
  });

  it("a 0-0 draw counts as played + draw with zero goals either way, never a win or loss for either side", () => {
    const matches = [makeMatch({ playerIds: ["p1"], score: 0, result: "draw" }, { playerIds: ["p2"], score: 0, result: "draw" }, "2026-03-01")];
    const standings = computeIndividualStandings(roster, matches);

    const p1 = standings.find((r) => r.id === "p1")!;
    expect(p1).toMatchObject({ played: 1, wins: 0, draws: 1, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 1 });

    const p2 = standings.find((r) => r.id === "p2")!;
    expect(p2).toMatchObject({ played: 1, wins: 0, draws: 1, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 1 });
  });

  it("orders the returned standings by points/GD/GF/winRate/wins/name", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }, "2026-03-01"),
      makeMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p3"], score: 0, result: "loss" }, "2026-03-02"),
    ];
    const standings = computeIndividualStandings(roster, matches);
    expect(standings.map((r) => r.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("omits a player with zero matches in the given set", () => {
    const matches = [makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, "2026-03-01")];
    const standings = computeIndividualStandings(roster, matches);
    expect(standings.some((r) => r.id === "p3")).toBe(false);
  });

  it("credits both players individually for a doubles match (individual attribution)", () => {
    const matches = [
      makeMatch(
        { playerIds: ["p1", "p2"], score: 4, result: "win" },
        { playerIds: ["p3"], score: 1, result: "loss" },
        "2026-03-01",
        "doubles",
      ),
    ];
    const standings = computeIndividualStandings(roster, matches);
    const p1 = standings.find((r) => r.id === "p1")!;
    const p2 = standings.find((r) => r.id === "p2")!;
    // Both p1 and p2 individually get credit for the same 4-1 doubles win.
    expect(p1).toMatchObject({ played: 1, wins: 1, goalsFor: 4, goalsAgainst: 1, points: 3 });
    expect(p2).toMatchObject({ played: 1, wins: 1, goalsFor: 4, goalsAgainst: 1, points: 3 });
  });
});

describe("computePairStandings", () => {
  it("aggregates a doubles pair's record regardless of which side they played on", () => {
    const matches = [
      makeMatch({ playerIds: ["p1", "p2"], score: 3, result: "win" }, { playerIds: ["p3", "p4"], score: 1, result: "loss" }, "2026-03-01", "doubles"),
      // Same pair, but now on side 2 -- must still accumulate into the same row.
      makeMatch({ playerIds: ["p3", "p4"], score: 0, result: "loss" }, { playerIds: ["p2", "p1"], score: 2, result: "win" }, "2026-03-02", "doubles"),
    ];
    const pairs = computePairStandings(matches);
    const p1p2 = pairs.find((r) => r.playerIds.includes("p1") && r.playerIds.includes("p2"))!;
    expect(p1p2).toMatchObject({ played: 2, wins: 2, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 1, goalDifference: 4, points: 6 });
  });

  it("names a pair with both display names joined by '&', in a stable (id-sorted) order", () => {
    const matches = [makeMatch({ playerIds: ["p2", "p1"], score: 1, result: "win" }, { playerIds: ["p3", "p4"], score: 0, result: "loss" }, "2026-03-01", "doubles")];
    const pairs = computePairStandings(matches);
    expect(pairs[0]!.name).toBe("p1 & p2"); // p1 < p2 alphabetically/by id
  });

  it("ignores singles matches entirely", () => {
    const matches = [makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, "2026-03-01", "singles")];
    expect(computePairStandings(matches)).toEqual([]);
  });

  it("keeps two different pairings of the same players as distinct rows", () => {
    const matches = [
      makeMatch({ playerIds: ["p1", "p2"], score: 1, result: "win" }, { playerIds: ["p3", "p4"], score: 0, result: "loss" }, "2026-03-01", "doubles"),
      makeMatch({ playerIds: ["p1", "p3"], score: 2, result: "win" }, { playerIds: ["p2", "p4"], score: 1, result: "loss" }, "2026-03-02", "doubles"),
    ];
    const pairs = computePairStandings(matches);
    expect(pairs).toHaveLength(4); // p1&p2, p3&p4, p1&p3, p2&p4
  });
});

describe("filterMatchesForStandings", () => {
  const matches = [
    makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, new Date(2026, 2, 15).toISOString()), // March
    makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, new Date(2026, 1, 10).toISOString()), // February
    makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, new Date(2025, 5, 1).toISOString()), // last year
  ];
  const now = new Date(2026, 2, 20); // Mar 20, 2026

  it("returns every match for 'all'", () => {
    expect(filterMatchesForStandings(matches, { type: "all" }, now)).toHaveLength(3);
  });

  it("returns only the current calendar month for 'currentMonth'", () => {
    const result = filterMatchesForStandings(matches, { type: "currentMonth" }, now);
    expect(result).toHaveLength(1);
    expect(new Date(result[0]!.played_at).getMonth()).toBe(2);
  });

  it("returns only the previous calendar month for 'previousMonth'", () => {
    const result = filterMatchesForStandings(matches, { type: "previousMonth" }, now);
    expect(result).toHaveLength(1);
    expect(new Date(result[0]!.played_at).getMonth()).toBe(1);
  });

  it("returns matches within an inclusive custom [start, end] range", () => {
    const result = filterMatchesForStandings(matches, { type: "custom", start: new Date(2026, 0, 1), end: new Date(2026, 11, 31) }, now);
    expect(result).toHaveLength(2); // March + February 2026, not the 2025 match
  });

  it("handles a previousMonth filter across a year boundary (January's previous month is December of the prior year)", () => {
    const decemberMatch = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, new Date(2025, 11, 20).toISOString());
    const result = filterMatchesForStandings([decemberMatch], { type: "previousMonth" }, new Date(2026, 0, 15));
    expect(result).toHaveLength(1);
  });
});

describe("sortStandingsByMetric", () => {
  function row(overrides: Partial<LeagueStandingRow> & { id: string }): LeagueStandingRow {
    return {
      name: overrides.id,
      playerIds: [overrides.id],
      played: 1,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      winRate: null,
      ...overrides,
    };
  }

  // Already in "points" (football) order -- p1 leads on points despite fewer wins/goals,
  // so any non-points sort must visibly reorder these.
  const rows = [
    row({ id: "p1", points: 10, wins: 2, goalsFor: 3, goalDifference: 1, winRate: 0.4 }),
    row({ id: "p2", points: 7, wins: 5, goalsFor: 10, goalDifference: 5, winRate: 0.9 }),
    row({ id: "p3", points: 4, wins: 1, goalsFor: 1, goalDifference: -2, winRate: 0.2 }),
  ];

  it("\"points\" is a no-op -- returns the same order (the default football sort)", () => {
    expect(sortStandingsByMetric(rows, "points").map((r) => r.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("sorts by wins descending", () => {
    expect(sortStandingsByMetric(rows, "wins").map((r) => r.id)).toEqual(["p2", "p1", "p3"]);
  });

  it("sorts by goals (goalsFor) descending", () => {
    expect(sortStandingsByMetric(rows, "goals").map((r) => r.id)).toEqual(["p2", "p1", "p3"]);
  });

  it("sorts by goal difference descending", () => {
    expect(sortStandingsByMetric(rows, "goalDifference").map((r) => r.id)).toEqual(["p2", "p1", "p3"]);
  });

  it("sorts by win rate descending, treating a null win rate as lowest", () => {
    const withNull = [...rows, row({ id: "p4", winRate: null })];
    expect(sortStandingsByMetric(withNull, "winRate").map((r) => r.id)).toEqual(["p2", "p1", "p3", "p4"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...rows];
    sortStandingsByMetric(rows, "wins");
    expect(rows).toEqual(copy);
  });
});
