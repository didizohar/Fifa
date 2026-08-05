import { computeAllAchievements, computeBestPartnershipAchievement, computePlayerAchievements } from "../src/lib/achievements";
import type { MatchSummary } from "../src/lib/matches";

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
}

function makeMatch(side1: SideSpec, side2: SideSpec, opts?: { matchType?: "singles" | "doubles"; playedAt?: string }): MatchSummary {
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
    match_type: opts?.matchType ?? "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: opts?.playedAt ?? new Date().toISOString(),
    sides: [toSide(side1, 1), toSide(side2, 2)],
  };
}

const base = Date.now();
const day = (n: number) => new Date(base + n * 86_400_000).toISOString();

describe("computePlayerAchievements", () => {
  it("returns nothing for a player with no matches", () => {
    expect(computePlayerAchievements("p1", [])).toEqual([]);
  });

  it("unlocks first-match, first-win, and first-goal on the very first match, with the same unlock date", () => {
    const match = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(0) });
    const achievements = computePlayerAchievements("p1", [match]);
    const ids = achievements.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["first-match", "first-win", "first-goal"]));
    for (const a of achievements) expect(a.unlockedAt).toBe(day(0));
  });

  it("does not unlock first-win or first-goal from a scoreless loss", () => {
    const match = makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, { playedAt: day(0) });
    const ids = computePlayerAchievements("p1", [match]).map((a) => a.id);
    expect(ids).toEqual(["first-match"]);
  });

  it("unlocks the 100-matches milestone exactly on the 100th match, not before", () => {
    const matches = Array.from({ length: 100 }, (_, n) =>
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(n) }),
    );
    const withNinetyNine = computePlayerAchievements("p1", matches.slice(0, 99));
    expect(withNinetyNine.some((a) => a.id === "hundred-matches")).toBe(false);

    const withHundred = computePlayerAchievements("p1", matches);
    const hundred = withHundred.find((a) => a.id === "hundred-matches");
    expect(hundred?.unlockedAt).toBe(day(99));
  });

  it("unlocks 'unstoppable' the moment a 10-match winning streak is reached", () => {
    const matches = Array.from({ length: 10 }, (_, n) =>
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(n) }),
    );
    const achievement = computePlayerAchievements("p1", matches).find((a) => a.id === "unstoppable");
    expect(achievement?.unlockedAt).toBe(day(9));
  });
});

describe("computeBestPartnershipAchievement", () => {
  it("returns null when no partnership meets the played/win-rate bar", () => {
    const matches = [makeMatch({ playerIds: ["p1", "mate"], score: 1, result: "win" }, { playerIds: ["x", "y"], score: 0, result: "loss" }, { matchType: "doubles" })];
    expect(computeBestPartnershipAchievement("p1", matches)).toBeNull();
  });

  it("finds a partnership with at least 10 matches and a 70%+ win rate", () => {
    const wins = Array.from({ length: 8 }, (_, n) =>
      makeMatch({ playerIds: ["p1", "mate"], score: 1, result: "win" }, { playerIds: ["x", "y"], score: 0, result: "loss" }, { matchType: "doubles", playedAt: day(n) }),
    );
    const losses = Array.from({ length: 2 }, (_, n) =>
      makeMatch({ playerIds: ["p1", "mate"], score: 0, result: "loss" }, { playerIds: ["x", "y"], score: 1, result: "win" }, { matchType: "doubles", playedAt: day(8 + n) }),
    );
    const achievement = computeBestPartnershipAchievement("p1", [...wins, ...losses]);
    expect(achievement).toMatchObject({ partnerId: "mate", partnerName: "mate" });
    expect(achievement?.descriptionParams.percent).toBe(80);
  });

  it("unlocks at the TRUE first match the 70% threshold was crossed, not just the 10th match, when the win rate rises later", () => {
    // 6-4 through the first 10 matches (60%) -- doesn't qualify yet.
    // Then 5 more straight wins: 70% is first crossed on the 14th match
    // (10/14 ≈ 71.4%), not the 10th, even though the FINAL record (11-4,
    // 73.3%) does qualify.
    const firstTen = [
      ...Array.from({ length: 6 }, (_, n) => makeMatch({ playerIds: ["p1", "mate"], score: 1, result: "win" }, { playerIds: ["x", "y"], score: 0, result: "loss" }, { matchType: "doubles", playedAt: day(n) })),
      ...Array.from({ length: 4 }, (_, n) => makeMatch({ playerIds: ["p1", "mate"], score: 0, result: "loss" }, { playerIds: ["x", "y"], score: 1, result: "win" }, { matchType: "doubles", playedAt: day(6 + n) })),
    ];
    const nextFive = Array.from({ length: 5 }, (_, n) =>
      makeMatch({ playerIds: ["p1", "mate"], score: 1, result: "win" }, { playerIds: ["x", "y"], score: 0, result: "loss" }, { matchType: "doubles", playedAt: day(10 + n) }),
    );

    const achievement = computeBestPartnershipAchievement("p1", [...firstTen, ...nextFive]);
    expect(achievement?.unlockedAt).toBe(day(13)); // the 14th match (index 13), not day(9) (the 10th)
  });
});

describe("computeAllAchievements", () => {
  it("combines threshold achievements with a qualifying partnership achievement", () => {
    const wins = Array.from({ length: 10 }, (_, n) =>
      makeMatch({ playerIds: ["p1", "mate"], score: 1, result: "win" }, { playerIds: ["x", "y"], score: 0, result: "loss" }, { matchType: "doubles", playedAt: day(n) }),
    );
    const ids = computeAllAchievements("p1", wins).map((a) => a.id);
    expect(ids).toContain("first-match");
    expect(ids.some((id) => id.startsWith("best-partnership-"))).toBe(true);
  });
});
