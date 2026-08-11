import { validateMatchForm, type MatchFormDraft } from "../src/lib/validation/matchForm";

const ROSTER = ["p1", "p2", "p3", "p4"];

function draft(overrides: Partial<MatchFormDraft> = {}): MatchFormDraft {
  return {
    matchType: "singles",
    side1: { clubVersionId: "cv1", playerIds: ["p1"], score: 3 },
    side2: { clubVersionId: "cv2", playerIds: ["p2"], score: 1 },
    isPenalties: false,
    penaltyScore1: null,
    penaltyScore2: null,
    ...overrides,
  };
}

describe("validateMatchForm", () => {
  it("accepts a valid decisive singles match and derives win/loss", () => {
    const result = validateMatchForm(draft(), ROSTER);
    expect(result).toEqual({ ok: true, side1Result: "win", side2Result: "loss", penaltyWinnerSide: undefined });
  });

  it("derives a draw when scores are level and not decided by penalties", () => {
    const result = validateMatchForm(
      draft({ side1: { clubVersionId: "cv1", playerIds: ["p1"], score: 2 }, side2: { clubVersionId: "cv2", playerIds: ["p2"], score: 2 } }),
      ROSTER,
    );
    expect(result).toEqual({ ok: true, side1Result: "draw", side2Result: "draw", penaltyWinnerSide: undefined });
  });

  it.each([0, 1, 2, 3])("accepts a %i-%i draw as valid -- ok:true with no errors, not just 'well-formed but rejected'", (level) => {
    const result = validateMatchForm(
      draft({ side1: { clubVersionId: "cv1", playerIds: ["p1"], score: level }, side2: { clubVersionId: "cv2", playerIds: ["p2"], score: level } }),
      ROSTER,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.side1Result).toBe("draw");
      expect(result.side2Result).toBe("draw");
    }
  });

  it("rejects the wrong number of players for singles", () => {
    const result = validateMatchForm(draft({ side1: { clubVersionId: "cv1", playerIds: ["p1", "p2"], score: 3 } }), ROSTER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("exactly 1 player"))).toBe(true);
  });

  it("requires exactly 2 players per side for doubles", () => {
    const result = validateMatchForm(
      draft({
        matchType: "doubles",
        side1: { clubVersionId: "cv1", playerIds: ["p1"], score: 3 },
        side2: { clubVersionId: "cv2", playerIds: ["p2"], score: 1 },
      }),
      ROSTER,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("exactly 2 players"))).toBe(true);
  });

  it("rejects a player selected twice on the same side", () => {
    const result = validateMatchForm(
      draft({
        matchType: "doubles",
        side1: { clubVersionId: "cv1", playerIds: ["p1", "p1"], score: 3 },
        side2: { clubVersionId: "cv2", playerIds: ["p3", "p4"], score: 1 },
      }),
      ROSTER,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("same player selected twice"))).toBe(true);
  });

  it("rejects a player appearing on both sides", () => {
    const result = validateMatchForm(draft({ side2: { clubVersionId: "cv2", playerIds: ["p1"], score: 1 } }), ROSTER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("both sides"))).toBe(true);
  });

  it("rejects a player who isn't on the group's roster", () => {
    const result = validateMatchForm(draft({ side1: { clubVersionId: "cv1", playerIds: ["ghost"], score: 3 } }), ROSTER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("roster"))).toBe(true);
  });

  it("rejects a missing club on either side", () => {
    const result = validateMatchForm(draft({ side1: { clubVersionId: null, playerIds: ["p1"], score: 3 } }), ROSTER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("needs a club"))).toBe(true);
  });

  it("rejects a negative score", () => {
    const result = validateMatchForm(draft({ side1: { clubVersionId: "cv1", playerIds: ["p1"], score: -1 } }), ROSTER);
    expect(result.ok).toBe(false);
  });

  it("rejects penalties when the score isn't level", () => {
    const result = validateMatchForm(draft({ isPenalties: true, penaltyScore1: 4, penaltyScore2: 2 }), ROSTER);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("level"))).toBe(true);
  });

  it("requires both penalty scores when the match went to penalties", () => {
    const result = validateMatchForm(
      draft({
        side1: { clubVersionId: "cv1", playerIds: ["p1"], score: 1 },
        side2: { clubVersionId: "cv2", playerIds: ["p2"], score: 1 },
        isPenalties: true,
        penaltyScore1: null,
        penaltyScore2: null,
      }),
      ROSTER,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("Enter both penalty"))).toBe(true);
  });

  it("rejects equal penalty scores -- a shootout must produce a winner", () => {
    const result = validateMatchForm(
      draft({
        side1: { clubVersionId: "cv1", playerIds: ["p1"], score: 1 },
        side2: { clubVersionId: "cv2", playerIds: ["p2"], score: 1 },
        isPenalties: true,
        penaltyScore1: 3,
        penaltyScore2: 3,
      }),
      ROSTER,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes("needs a winner"))).toBe(true);
  });

  it("derives the penalty winner and never returns a draw when penalties decide it", () => {
    const result = validateMatchForm(
      draft({
        side1: { clubVersionId: "cv1", playerIds: ["p1"], score: 2 },
        side2: { clubVersionId: "cv2", playerIds: ["p2"], score: 2 },
        isPenalties: true,
        penaltyScore1: 3,
        penaltyScore2: 5,
      }),
      ROSTER,
    );
    expect(result).toEqual({ ok: true, side1Result: "loss", side2Result: "win", penaltyWinnerSide: 2 });
  });
});
