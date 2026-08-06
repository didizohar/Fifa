import { filterClubsByPool } from "../src/lib/clubPools";

function club(id: string, star_rating: number) {
  return { id, star_rating };
}

const POOL = [club("a", 3), club("b", 3.5), club("c", 4), club("d", 4.5), club("e", 5)];

describe("filterClubsByPool", () => {
  it("'large' keeps only 4.5 and 5 star clubs", () => {
    const result = filterClubsByPool(POOL, "large");
    expect(result.map((c) => c.id).sort()).toEqual(["d", "e"]);
  });

  it("'small' keeps only 3.5 and 4 star clubs", () => {
    const result = filterClubsByPool(POOL, "small");
    expect(result.map((c) => c.id).sort()).toEqual(["b", "c"]);
  });

  it("'random' returns every club unfiltered", () => {
    const result = filterClubsByPool(POOL, "random");
    expect(result.map((c) => c.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("excludes a 3-star club from both 'large' and 'small'", () => {
    expect(filterClubsByPool(POOL, "large").some((c) => c.id === "a")).toBe(false);
    expect(filterClubsByPool(POOL, "small").some((c) => c.id === "a")).toBe(false);
  });

  it("does not mutate the input array", () => {
    const snapshot = [...POOL];
    filterClubsByPool(POOL, "random");
    expect(POOL).toEqual(snapshot);
  });
});
