import { drawClubsForMatch } from "../src/lib/random/matchClubDraw";
import { createSeededRng } from "../src/lib/random/rng";

interface TestClub {
  id: string;
  name: string;
  star_rating: number;
}

function club(id: string, name: string, star_rating: number): TestClub {
  return { id, name, star_rating };
}

const rng = (seed = 1) => createSeededRng(seed);

describe("drawClubsForMatch -- sameStar mode", () => {
  const clubs = [club("barca", "Barcelona", 5), club("real", "Real Madrid", 5), club("psg", "PSG", 4), club("juve", "Juventus", 3)];

  it("draws two different clubs at exactly the requested star level", () => {
    const outcome = drawClubsForMatch({ clubs, starMode: "sameStar", selectedStarLevel: 5, randomFn: rng() });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.clubA.star_rating).toBe(5);
    expect(outcome.result.clubB.star_rating).toBe(5);
    expect(outcome.result.clubA.id).not.toBe(outcome.result.clubB.id);
    expect(outcome.result.starDifference).toBe(0);
    expect(outcome.result.selectionMode).toBe("sameStar");
  });

  it("can draw Barcelona and Real Madrid specifically when both are eligible at the same level", () => {
    // With only two 5-star clubs in the pool, both must be selected.
    const outcome = drawClubsForMatch({ clubs, starMode: "sameStar", selectedStarLevel: 5, randomFn: rng(7) });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(new Set([outcome.result.clubA.id, outcome.result.clubB.id])).toEqual(new Set(["barca", "real"]));
  });

  it("reports notEnoughClubs when fewer than two clubs exist at the selected level", () => {
    const outcome = drawClubsForMatch({ clubs, starMode: "sameStar", selectedStarLevel: 4, randomFn: rng() });
    expect(outcome).toEqual({ ok: false, reason: "notEnoughClubs" });
  });

  it("reports notEnoughClubs when no star level is provided", () => {
    const outcome = drawClubsForMatch({ clubs, starMode: "sameStar", selectedStarLevel: null, randomFn: rng() });
    expect(outcome.ok).toBe(false);
  });

  it("never assigns the same club to both pairs, across many draws", () => {
    for (let seed = 0; seed < 30; seed++) {
      const outcome = drawClubsForMatch({ clubs, starMode: "sameStar", selectedStarLevel: 5, randomFn: rng(seed) });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.result.clubA.id).not.toBe(outcome.result.clubB.id);
    }
  });

  it("is deterministic given the same injected random function", () => {
    const a = drawClubsForMatch({ clubs, starMode: "sameStar", selectedStarLevel: 5, randomFn: rng(99) });
    const b = drawClubsForMatch({ clubs, starMode: "sameStar", selectedStarLevel: 5, randomFn: rng(99) });
    expect(a).toEqual(b);
  });

  it("does not mutate the input clubs array", () => {
    const snapshot = JSON.parse(JSON.stringify(clubs));
    drawClubsForMatch({ clubs, starMode: "sameStar", selectedStarLevel: 5, randomFn: rng() });
    expect(clubs).toEqual(snapshot);
  });
});

describe("drawClubsForMatch -- similarStrength mode", () => {
  it("prefers an exact star match when one exists in the pool", () => {
    const clubs = [club("barca", "Barcelona", 5), club("real", "Real Madrid", 5), club("psg", "PSG", 4)];
    const outcome = drawClubsForMatch({ clubs, starMode: "similarStrength", randomFn: rng(3) });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.starDifference).toBe(0);
    expect(new Set([outcome.result.clubA.id, outcome.result.clubB.id])).toEqual(new Set(["barca", "real"]));
  });

  it("falls back to the nearest available rating when no exact match exists", () => {
    const clubs = [club("a", "A", 5), club("b", "B", 3), club("c", "C", 1)];
    const outcome = drawClubsForMatch({ clubs, starMode: "similarStrength", randomFn: rng() });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // Tightest possible spread among distinct pairs is 5-vs-3 or 3-vs-1 (both spread 2) -- never the 4-spread 5-vs-1 pair.
    expect(outcome.result.starDifference).toBe(2);
  });

  it("reports notEnoughClubs with fewer than two valid clubs", () => {
    const outcome = drawClubsForMatch({ clubs: [club("a", "A", 5)], starMode: "similarStrength", randomFn: rng() });
    expect(outcome).toEqual({ ok: false, reason: "notEnoughClubs" });
  });
});

describe("drawClubsForMatch -- anyStrength mode", () => {
  const clubs = [club("barca", "Barcelona", 5), club("real", "Real Madrid", 5), club("psg", "PSG", 4), club("juve", "Juventus", 3)];

  it("draws any two different eligible clubs regardless of rating", () => {
    const outcome = drawClubsForMatch({ clubs, starMode: "anyStrength", randomFn: rng(5) });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.clubA.id).not.toBe(outcome.result.clubB.id);
    expect(outcome.result.selectionMode).toBe("anyStrength");
  });

  it("reports notEnoughClubs with fewer than two clubs total", () => {
    const outcome = drawClubsForMatch({ clubs: [club("a", "A", 5)], starMode: "anyStrength", randomFn: rng() });
    expect(outcome).toEqual({ ok: false, reason: "notEnoughClubs" });
  });
});

describe("drawClubsForMatch -- shared behavior", () => {
  it("drops clubs with an invalid/missing star rating before drawing (inactive/archived-style data gaps)", () => {
    const clubs = [club("a", "A", 5), club("b", "B", NaN), { id: "c", name: "C", star_rating: null as unknown as number }];
    const outcome = drawClubsForMatch({ clubs, starMode: "anyStrength", randomFn: rng() });
    // Only "a" has a genuinely valid rating -- never enough to draw two, and "b"/"c" must never be selected.
    expect(outcome).toEqual({ ok: false, reason: "notEnoughClubs" });
  });

  it("redrawing with a different random function changes the result while keeping the same mode", () => {
    const clubs = [club("a", "A", 5), club("b", "B", 5), club("c", "C", 5), club("d", "D", 5)];
    const first = drawClubsForMatch({ clubs, starMode: "sameStar", selectedStarLevel: 5, randomFn: rng(1) });
    const second = drawClubsForMatch({ clubs, starMode: "sameStar", selectedStarLevel: 5, randomFn: rng(2) });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.result.selectionMode).toBe(second.result.selectionMode);
    }
  });
});
