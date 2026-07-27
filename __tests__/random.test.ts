import { assignBalancedClubs, assignHandicapClubs, assignRandomClubs, filterClubsByExactStars, filterClubsByStarRange } from "../src/lib/random/clubs";
import { createSeededRng, sample, shuffle } from "../src/lib/random/rng";
import { movePlayerBetweenTeams, splitIntoBalancedTeams, splitIntoTeams } from "../src/lib/random/teams";

const rng = () => createSeededRng(42);

function players(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `Player ${i}` }));
}

function clubs(starRatings: number[]) {
  return starRatings.map((starRating, i) => ({ id: `c${i}`, starRating }));
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
    expect(result.map((c) => c.starRating)).toEqual([5, 5]);
  });

  it("filters to a star range inclusive of both ends", () => {
    const result = filterClubsByStarRange(clubs([1, 2, 3, 4, 5]), 3, 4);
    expect(result.map((c) => c.starRating)).toEqual([3, 4]);
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
    const ratings = result.assignments.map((c) => c.starRating).sort((a, b) => a - b);
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
    expect(strong?.club.starRating).toBe(1);
    expect(weak?.club.starRating).toBe(5);
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
