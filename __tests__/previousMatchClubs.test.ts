import { getPreviousMatchClubs, swapPreviousMatchClubs } from "../src/lib/previousMatchClubs";
import type { MatchSummary } from "../src/lib/matches";

function makeMatch(overrides: Partial<{ side1ClubVersionId: string | null; side2ClubVersionId: string | null }> = {}): MatchSummary {
  const { side1ClubVersionId = "cv-barca", side2ClubVersionId = "cv-real" } = overrides;
  return {
    id: "m1",
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: "2026-01-01T00:00:00Z",
    sides: [
      {
        id: "s1",
        side_number: 1,
        score: 3,
        penalty_score: null,
        result: "win",
        club_version_id: side1ClubVersionId,
        club: side1ClubVersionId ? { id: "barca", name: "Barcelona" } : null,
        players: [],
      },
      {
        id: "s2",
        side_number: 2,
        score: 1,
        penalty_score: null,
        result: "loss",
        club_version_id: side2ClubVersionId,
        club: side2ClubVersionId ? { id: "real", name: "Real Madrid" } : null,
        players: [],
      },
    ],
  };
}

describe("getPreviousMatchClubs", () => {
  it("extracts club_version_ids and names from both sides", () => {
    const result = getPreviousMatchClubs(makeMatch());
    expect(result).toEqual({
      side1ClubVersionId: "cv-barca",
      side2ClubVersionId: "cv-real",
      side1ClubName: "Barcelona",
      side2ClubName: "Real Madrid",
    });
  });

  it("returns null when there's no match", () => {
    expect(getPreviousMatchClubs(null)).toBeNull();
    expect(getPreviousMatchClubs(undefined)).toBeNull();
  });

  it("returns null when a side has no club_version_id (legacy data)", () => {
    expect(getPreviousMatchClubs(makeMatch({ side1ClubVersionId: null }))).toBeNull();
    expect(getPreviousMatchClubs(makeMatch({ side2ClubVersionId: null }))).toBeNull();
  });
});

describe("swapPreviousMatchClubs", () => {
  it("swaps side1 and side2's clubs and names", () => {
    const original = getPreviousMatchClubs(makeMatch())!;
    const swapped = swapPreviousMatchClubs(original);
    expect(swapped).toEqual({
      side1ClubVersionId: "cv-real",
      side2ClubVersionId: "cv-barca",
      side1ClubName: "Real Madrid",
      side2ClubName: "Barcelona",
    });
  });

  it("does not mutate the input", () => {
    const original = getPreviousMatchClubs(makeMatch())!;
    const snapshot = { ...original };
    swapPreviousMatchClubs(original);
    expect(original).toEqual(snapshot);
  });
});
