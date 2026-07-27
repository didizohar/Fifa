import { computeLeagueSummary, computeMatchesPerWeek } from "../src/lib/leagueStats";
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

describe("computeLeagueSummary", () => {
  it("returns all zeros / nulls for an empty league", () => {
    expect(computeLeagueSummary([], [])).toEqual({ matchesPlayed: 0, totalGoals: 0, playersCount: 0, currentLeader: null });
  });

  it("sums goals across both sides of every match", () => {
    const matches = [
      makeMatch({ playerIds: ["a"], score: 3, result: "win" }, { playerIds: ["b"], score: 1, result: "loss" }),
      makeMatch({ playerIds: ["a"], score: 2, result: "win" }, { playerIds: ["b"], score: 2, result: "draw" }),
    ];
    const summary = computeLeagueSummary(roster(["a", "b"]), matches);
    expect(summary.matchesPlayed).toBe(2);
    expect(summary.totalGoals).toBe(3 + 1 + 2 + 2);
    expect(summary.playersCount).toBe(2);
  });

  it("names the top of the win-rate leaderboard as the current leader, once qualified", () => {
    const matches = Array.from({ length: 5 }, () => makeMatch({ playerIds: ["a"], score: 1, result: "win" }, { playerIds: ["b"], score: 0, result: "loss" }));
    const summary = computeLeagueSummary(roster(["a", "b"]), matches);
    expect(summary.currentLeader).toEqual({ playerId: "a", playerName: "a" });
  });

  it("has no current leader when nobody has qualified yet", () => {
    const matches = [makeMatch({ playerIds: ["a"], score: 1, result: "win" }, { playerIds: ["b"], score: 0, result: "loss" })];
    expect(computeLeagueSummary(roster(["a", "b"]), matches).currentLeader).toBeNull();
  });
});

describe("computeMatchesPerWeek", () => {
  it("returns exactly `weeks` buckets, oldest first, zero-filled for weeks with no matches", () => {
    const now = new Date(2026, 5, 17); // a Wednesday
    const rows = computeMatchesPerWeek([], now, 4);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.count === 0)).toBe(true);
    // Oldest first: weekStart dates should be strictly increasing.
    const starts = rows.map((r) => r.weekStart);
    expect(starts).toEqual([...starts].sort());
  });

  it("buckets matches into the correct calendar week regardless of day-of-week", () => {
    const now = new Date(2026, 5, 17); // Wed, week of Jun 15-21
    const thisWeekMonday = makeMatch({ playerIds: ["a"], score: 1, result: "win" }, { playerIds: ["b"], score: 0, result: "loss" }, new Date(2026, 5, 15).toISOString());
    const thisWeekSunday = makeMatch({ playerIds: ["a"], score: 1, result: "win" }, { playerIds: ["b"], score: 0, result: "loss" }, new Date(2026, 5, 21).toISOString());
    const lastWeek = makeMatch({ playerIds: ["a"], score: 1, result: "win" }, { playerIds: ["b"], score: 0, result: "loss" }, new Date(2026, 5, 10).toISOString());

    const rows = computeMatchesPerWeek([thisWeekMonday, thisWeekSunday, lastWeek], now, 2);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.count).toBe(1); // last week
    expect(rows[1]!.count).toBe(2); // this week (both Monday and Sunday land in the same bucket)
  });

  it("ignores matches older than the requested window", () => {
    const now = new Date(2026, 5, 17);
    const wayBack = makeMatch({ playerIds: ["a"], score: 1, result: "win" }, { playerIds: ["b"], score: 0, result: "loss" }, new Date(2020, 0, 1).toISOString());
    const rows = computeMatchesPerWeek([wayBack], now, 4);
    expect(rows.every((r) => r.count === 0)).toBe(true);
  });
});
