import { assignBalancedClubs, assignHandicapClubs, assignRandomClubs, filterClubsByExactStars, filterClubsByStarRange, filterValidClubVersions } from "../src/lib/random/clubs";
import { DRAW_LEVEL_DEFAULT, averageDrawLevel, resolveDrawLevel } from "../src/lib/random/drawLevel";
import { chunkIntoSides, generateFullMatchup } from "../src/lib/random/matchup";
import { createSeededRng, sample, shuffle } from "../src/lib/random/rng";
import { movePlayerBetweenTeams, splitIntoBalancedTeams, splitIntoTeams } from "../src/lib/random/teams";

const rng = () => createSeededRng(42);

function players(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
}

function clubs(starRatings: number[]) {
  return starRatings.map((star_rating, i) => ({ id: `c${i}`, star_rating }));
}

describe("shuffle", () => {
  it("is a permutation -- same elements, same length, order can differ", () => {
    const input = players(10);
    const result = shuffle(input, rng());
    expect(result).toHaveLength(input.length);
    expect(new Set(result.map((p) => p.id))).toEqual(new Set(input.map((p) => p.id)));
  });

  it("never mutates the input array", () => {
    const input = players(5);
    const copy = [...input];
    shuffle(input, rng());
    expect(input).toEqual(copy);
  });

  it("is deterministic for a given injected RNG", () => {
    const input = players(8);
    expect(shuffle(input, createSeededRng(7))).toEqual(shuffle(input, createSeededRng(7)));
  });

  it("produces a different order for a different seed (not the identity permutation)", () => {
    const input = players(20);
    const result = shuffle(input, createSeededRng(1));
    expect(result.map((p) => p.id)).not.toEqual(input.map((p) => p.id));
  });
});

describe("sample", () => {
  it("selects unique players with no repeats", () => {
    const input = players(12);
    const result = sample(input, 5, rng());
    expect(result).toHaveLength(5);
    expect(new Set(result.map((p) => p.id)).size).toBe(5);
  });

  it("caps the result at the available count when fewer players are eligible than requested", () => {
    const input = players(3);
    const result = sample(input, 10, rng());
    expect(result).toHaveLength(3);
  });

  it("returns an empty array when there are zero eligible players", () => {
    expect(sample([], 5, rng())).toEqual([]);
  });

  it("returns exactly one player when requesting one", () => {
    const input = players(4);
    expect(sample(input, 1, rng())).toHaveLength(1);
  });
});

describe("splitIntoTeams", () => {
  it("distributes an even player count evenly across teams", () => {
    const teams = splitIntoTeams(players(8), 2, { rng: rng() });
    expect(teams).toHaveLength(2);
    expect(teams[0].length).toBe(4);
    expect(teams[1].length).toBe(4);
  });

  it("spreads an uneven player count as evenly as possible instead of piling onto one team", () => {
    const teams = splitIntoTeams(players(7), 3, { rng: rng() });
    const sizes = teams.map((t) => t.length).sort();
    expect(sizes).toEqual([2, 2, 3]);
  });

  it("never drops a player", () => {
    const input = players(11);
    const teams = splitIntoTeams(input, 3, { rng: rng() });
    const allIds = teams.flat().map((p) => p.id);
    expect(new Set(allIds)).toEqual(new Set(input.map((p) => p.id)));
  });

  it("keeps a locked player on their assigned team through a redraw", () => {
    const input = players(6);
    const locked = new Map([["p0", 1]]);
    const teams = splitIntoTeams(input, 2, { rng: createSeededRng(1), locked });
    expect(teams[1].some((p) => p.id === "p0")).toBe(true);

    const redrawn = splitIntoTeams(input, 2, { rng: createSeededRng(99), locked });
    expect(redrawn[1].some((p) => p.id === "p0")).toBe(true);
  });
});

describe("splitIntoBalancedTeams", () => {
  const rated = (ratings: number[]) => ratings.map((rating, i) => ({ id: `p${i}`, rating }));
  const getRating = (p: { rating: number }) => p.rating;

  it("minimizes the total rating difference between teams", () => {
    const teams = splitIntoBalancedTeams(rated([5, 5, 1, 1]), 2, getRating, { rng: rng() });
    const totals = teams.map((team) => team.reduce((sum, p) => sum + p.rating, 0));
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(0);
  });

  it("never drops a player", () => {
    const input = rated([1, 2, 3, 4, 5, 1, 2, 3]);
    const teams = splitIntoBalancedTeams(input, 3, getRating, { rng: rng() });
    expect(teams.flat()).toHaveLength(input.length);
  });

  it("respects locked players while still balancing the rest", () => {
    const input = rated([5, 5, 1, 1]);
    const locked = new Map([["p0", 0]]);
    const teams = splitIntoBalancedTeams(input, 2, getRating, { rng: rng(), locked });
    expect(teams[0].some((p) => p.id === "p0")).toBe(true);
  });

  it("varies the outcome across redraws among similarly-balanced options", () => {
    const input = rated([3, 3, 3, 3, 3, 3]);
    const a = splitIntoBalancedTeams(input, 2, getRating, { rng: createSeededRng(1) });
    const b = splitIntoBalancedTeams(input, 2, getRating, { rng: createSeededRng(2) });
    expect(a.map((t) => t.map((p) => p.id).sort())).not.toEqual(b.map((t) => t.map((p) => p.id).sort()));
  });
});

describe("movePlayerBetweenTeams", () => {
  it("moves a player from one team to another", () => {
    const teams = [
      [{ id: "a" }, { id: "b" }],
      [{ id: "c" }],
    ];
    const result = movePlayerBetweenTeams(teams, "a", 0, 1);
    expect(result[0].map((p) => p.id)).toEqual(["b"]);
    expect(result[1].map((p) => p.id)).toEqual(["c", "a"]);
  });

  it("never mutates the input teams", () => {
    const teams = [[{ id: "a" }], [{ id: "b" }]];
    const before = JSON.parse(JSON.stringify(teams));
    movePlayerBetweenTeams(teams, "a", 0, 1);
    expect(teams).toEqual(before);
  });

  it("is a no-op when the player isn't found", () => {
    const teams = [[{ id: "a" }], [{ id: "b" }]];
    const result = movePlayerBetweenTeams(teams, "missing", 0, 1);
    expect(result).toEqual(teams);
  });

  it("is a no-op when the target team index is out of range", () => {
    const teams = [[{ id: "a" }], [{ id: "b" }]];
    const result = movePlayerBetweenTeams(teams, "a", 0, 5);
    expect(result).toEqual(teams);
  });
});

describe("club star filters", () => {
  it("filters to an exact star rating", () => {
    const result = filterClubsByExactStars(clubs([3, 4, 5, 5, 2]), 5);
    expect(result.map((c) => c.star_rating)).toEqual([5, 5]);
  });

  it("filters to an exact half-star rating (e.g. 4.5) -- no special-casing, same equality check as whole ratings", () => {
    const result = filterClubsByExactStars(clubs([4, 4.5, 4.5, 5, 3.5]), 4.5);
    expect(result.map((c) => c.star_rating)).toEqual([4.5, 4.5]);
  });

  it("filters to a star range inclusive of both ends", () => {
    const result = filterClubsByStarRange(clubs([1, 2, 3, 4, 5]), 3, 4);
    expect(result.map((c) => c.star_rating)).toEqual([3, 4]);
  });
});

describe("assignRandomClubs", () => {
  it("assigns one distinct club per participant when there are enough unique clubs", () => {
    const result = assignRandomClubs(clubs([1, 2, 3, 4, 5]), 3, { rng: rng() });
    expect(result.assignments).toHaveLength(3);
    expect(result.usedDuplicates).toBe(false);
  });

  it("falls back to duplicates when there aren't enough unique clubs available", () => {
    const result = assignRandomClubs(clubs([5]), 3, { rng: rng() });
    expect(result.assignments).toHaveLength(3);
    expect(result.usedDuplicates).toBe(true);
  });

  it("allows duplicates when explicitly requested", () => {
    const result = assignRandomClubs(clubs([1, 2]), 2, { rng: rng(), allowDuplicates: true });
    expect(result.assignments).toHaveLength(2);
  });

  it("returns nothing when there are no clubs", () => {
    expect(assignRandomClubs([], 3, { rng: rng() })).toEqual({ assignments: [], usedDuplicates: false });
  });
});

describe("assignBalancedClubs", () => {
  it("picks the window of clubs with the smallest star spread", () => {
    const result = assignBalancedClubs(clubs([1, 1.5, 4, 4.5, 5]), 2, { rng: rng() });
    const ratings = result.assignments.map((c) => c.star_rating).sort((a, b) => a - b);
    expect(ratings[1] - ratings[0]).toBeCloseTo(0.5);
  });

  it("falls back to duplicates when there aren't enough unique clubs", () => {
    const result = assignBalancedClubs(clubs([3]), 2, { rng: rng() });
    expect(result.assignments).toHaveLength(2);
    expect(result.usedDuplicates).toBe(true);
  });
});

describe("assignHandicapClubs", () => {
  it("gives the highest draw level the weakest club, using only the supplied draw level", () => {
    const participants = [
      { participant: { id: "strong" }, drawLevel: 5 },
      { participant: { id: "weak" }, drawLevel: 1 },
    ];
    const result = assignHandicapClubs(participants, clubs([1, 5]), { rng: rng() });
    const strong = result.find((r) => r.participant.id === "strong");
    const weak = result.find((r) => r.participant.id === "weak");
    expect(strong?.club.star_rating).toBe(1);
    expect(weak?.club.star_rating).toBe(5);
  });

  it("never drops a participant when clubs are scarcer than participants", () => {
    const participants = [
      { participant: { id: "a" }, drawLevel: 3 },
      { participant: { id: "b" }, drawLevel: 4 },
      { participant: { id: "c" }, drawLevel: 5 },
    ];
    const result = assignHandicapClubs(participants, clubs([2]), { rng: rng() });
    expect(result).toHaveLength(3);
  });
});

describe("chunkIntoSides", () => {
  it("splits an even list into two equal halves in order", () => {
    const [side1, side2] = chunkIntoSides(players(4));
    expect(side1.map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(side2.map((p) => p.id)).toEqual(["p2", "p3"]);
  });

  it("gives the extra item to the first side for an odd list", () => {
    const [side1, side2] = chunkIntoSides(players(3));
    expect(side1).toHaveLength(2);
    expect(side2).toHaveLength(1);
  });
});

describe("generateFullMatchup", () => {
  it("returns null when there aren't enough eligible players", () => {
    const result = generateFullMatchup({
      eligiblePlayers: players(3),
      requiredPlayers: 4,
      randomizeSides: true,
      clubPool: clubs([3, 4]),
      clubMode: "random",
      rng: rng(),
    });
    expect(result).toBeNull();
  });

  it("draws exactly the required players split across two sides, and one club per side", () => {
    const result = generateFullMatchup({
      eligiblePlayers: players(6),
      requiredPlayers: 4,
      randomizeSides: true,
      clubPool: clubs([1, 2, 3, 4, 5]),
      clubMode: "random",
      rng: rng(),
    });
    expect(result).not.toBeNull();
    expect(result!.sides[0].length + result!.sides[1].length).toBe(4);
    expect(new Set(result!.sides.flat().map((p) => p.id)).size).toBe(4);
    expect(result!.clubs).toHaveLength(2);
    expect(result!.clubs![0].id).not.toBe(result!.clubs![1].id);
  });

  it("returns null clubs when the club pool is empty, without failing the player draw", () => {
    const result = generateFullMatchup({
      eligiblePlayers: players(4),
      requiredPlayers: 2,
      randomizeSides: true,
      clubPool: [],
      clubMode: "random",
      rng: rng(),
    });
    expect(result).not.toBeNull();
    expect(result!.clubs).toBeNull();
  });

  it("uses a fixed, non-randomized side split when randomizeSides is false", () => {
    const result = generateFullMatchup({
      eligiblePlayers: players(2),
      requiredPlayers: 2,
      randomizeSides: false,
      clubPool: [],
      clubMode: "random",
      rng: rng(),
    });
    expect(result!.sides[0]).toHaveLength(1);
    expect(result!.sides[1]).toHaveLength(1);
  });

  it("assigns handicap clubs using only the supplied draw level, not player order", () => {
    const rated = [
      { id: "strong", drawLevel: 5 },
      { id: "weak", drawLevel: 1 },
    ];
    const result = generateFullMatchup({
      eligiblePlayers: rated,
      requiredPlayers: 2,
      randomizeSides: false,
      clubPool: clubs([1, 5]),
      clubMode: "handicap",
      getDrawLevel: (p) => p.drawLevel,
      rng: rng(),
    });
    const strongSideStars = result!.sides[0][0].drawLevel === 5 ? result!.clubs![0].star_rating : result!.clubs![1].star_rating;
    expect(strongSideStars).toBe(1);
  });
});

describe("resolveDrawLevel", () => {
  it("returns the configured level unchanged", () => {
    expect(resolveDrawLevel(5)).toBe(5);
    expect(resolveDrawLevel(1)).toBe(1);
  });

  it("defaults a missing draw level to average (3), predictably, not by excluding the player", () => {
    expect(resolveDrawLevel(null)).toBe(DRAW_LEVEL_DEFAULT);
    expect(resolveDrawLevel(undefined)).toBe(DRAW_LEVEL_DEFAULT);
  });
});

describe("averageDrawLevel", () => {
  it("averages configured levels", () => {
    const group = [{ level: 5 }, { level: 1 }];
    expect(averageDrawLevel(group, (p) => p.level)).toBe(3);
  });

  it("substitutes the default for missing levels individually rather than dropping those players", () => {
    const group = [{ level: 5 }, { level: null }];
    expect(averageDrawLevel(group, (p) => p.level)).toBe((5 + DRAW_LEVEL_DEFAULT) / 2);
  });

  it("returns the default for an empty group", () => {
    expect(averageDrawLevel([], () => null)).toBe(DRAW_LEVEL_DEFAULT);
  });
});

describe("filterValidClubVersions", () => {
  it("drops entries with a missing or non-numeric star rating without crashing", () => {
    const input = [
      { id: "a", star_rating: 4 },
      { id: "b", star_rating: null },
      { id: "c", star_rating: undefined },
      { id: "d", star_rating: 3.5 },
    ];
    const result = filterValidClubVersions(input);
    expect(result.map((c) => c.id)).toEqual(["a", "d"]);
  });

  it("returns an empty array when every entry is invalid, instead of throwing", () => {
    expect(filterValidClubVersions([{ id: "a", star_rating: null }])).toEqual([]);
  });
});
