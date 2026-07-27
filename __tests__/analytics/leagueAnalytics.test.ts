import {
  calculateClubPopularity,
  calculateGoalsTimeline,
  calculateHourlyActivity,
  calculateLeagueAnalytics,
  calculateMatchesTimeline,
  calculateMonthlyActivity,
  calculateAverageGoalDifferenceTimeline,
  calculateAverageScoreTimeline,
  calculatePlayerParticipation,
  calculateTopScorersTimeline,
  calculateWeekdayActivity,
  calculateWinRateEvolution,
} from "../../src/lib/analytics/leagueAnalytics";
import type { MatchSidePlayer, MatchSummary } from "../../src/lib/matches";
import type { MatchType } from "../../src/lib/types/database";

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
  clubId?: string;
  clubName?: string;
}

function makeMatch(side1: SideSpec, side2: SideSpec, opts?: { playedAt?: string; matchType?: MatchType }): MatchSummary {
  const toSide = (spec: SideSpec, sideNumber: 1 | 2) => ({
    id: `side-${sideNumber}-${Math.random()}`,
    side_number: sideNumber,
    score: spec.score,
    penalty_score: null,
    result: spec.result,
    club: spec.clubId ? { id: spec.clubId, name: spec.clubName ?? spec.clubId } : null,
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

function roster(ids: string[]): MatchSidePlayer[] {
  return ids.map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" }));
}

const win = (playerIds: string[], score: number): SideSpec => ({ playerIds, score, result: "win" });
const loss = (playerIds: string[], score: number): SideSpec => ({ playerIds, score, result: "loss" });

describe("league timelines", () => {
  const now = new Date(2026, 6, 27, 12);
  const matches = [
    makeMatch(win(["a"], 3), loss(["b"], 1), { playedAt: now.toISOString() }),
    makeMatch(win(["a"], 2), loss(["b"], 0), { playedAt: now.toISOString() }),
    makeMatch(win(["b"], 1), loss(["a"], 0), { playedAt: new Date(now.getTime() - 86_400_000).toISOString() }),
  ];

  it("calculateMatchesTimeline counts matches per bucket", () => {
    const points = calculateMatchesTimeline(matches, "7d", now);
    expect(points.at(-1)!.value).toBe(2);
    expect(points.at(-2)!.value).toBe(1);
  });

  it("calculateGoalsTimeline sums both sides' goals per bucket", () => {
    const points = calculateGoalsTimeline(matches, "7d", now);
    expect(points.at(-1)!.value).toBe(3 + 1 + 2 + 0);
  });

  it("calculateAverageScoreTimeline is total goals divided by match count", () => {
    const points = calculateAverageScoreTimeline(matches, "7d", now);
    expect(points.at(-1)!.value).toBeCloseTo((3 + 1 + 2 + 0) / 2);
  });

  it("calculateAverageGoalDifferenceTimeline averages the absolute margin, not the signed one", () => {
    const points = calculateAverageGoalDifferenceTimeline(matches, "7d", now);
    // margins today: |3-1|=2, |2-0|=2 -> average 2
    expect(points.at(-1)!.value).toBeCloseTo(2);
  });

  it("empty history produces zero-valued buckets without throwing", () => {
    expect(() => calculateMatchesTimeline([], "30d", now)).not.toThrow();
    expect(calculateMatchesTimeline([], "30d", now).every((p) => p.value === 0)).toBe(true);
  });

  it("drops matches with an invalid date instead of crashing", () => {
    const bad = makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: "not-a-date" });
    expect(() => calculateMatchesTimeline([bad], "7d", now)).not.toThrow();
  });
});

describe("calculatePlayerParticipation", () => {
  const now = new Date(2026, 6, 27, 12);

  it("counts matches played per roster member and computes their share", () => {
    const matches = [
      makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: now.toISOString() }),
      makeMatch(win(["a"], 1), loss(["c"], 0), { playedAt: now.toISOString() }),
    ];
    const rows = calculatePlayerParticipation(roster(["a", "b", "c"]), matches, "all", now);
    expect(rows[0]).toEqual({ playerId: "a", playerName: "a", matchesPlayed: 2, share: 1 });
    expect(rows.find((r) => r.playerId === "b")?.share).toBeCloseTo(0.5);
  });

  it("returns zeroed rows for an empty history", () => {
    const rows = calculatePlayerParticipation(roster(["a", "b"]), [], "all", now);
    expect(rows.every((r) => r.matchesPlayed === 0 && r.share === 0)).toBe(true);
  });
});

describe("calculateClubPopularity", () => {
  it("tallies matchesPlayed, winRate, and share per club across both sides", () => {
    const matches = [
      makeMatch({ playerIds: ["a"], score: 2, result: "win", clubId: "barca", clubName: "Barcelona" }, { playerIds: ["b"], score: 1, result: "loss", clubId: "real", clubName: "Real Madrid" }),
      makeMatch({ playerIds: ["a"], score: 1, result: "loss", clubId: "barca", clubName: "Barcelona" }, { playerIds: ["b"], score: 2, result: "win", clubId: "real", clubName: "Real Madrid" }),
    ];
    const rows = calculateClubPopularity(matches, "all");
    const barca = rows.find((r) => r.clubId === "barca")!;
    expect(barca.matchesPlayed).toBe(2);
    expect(barca.winRate).toBeCloseTo(0.5);
    expect(barca.share).toBeCloseTo(0.5);
  });

  it("ignores sides with no club recorded", () => {
    const matches = [makeMatch(win(["a"], 1), loss(["b"], 0))];
    expect(calculateClubPopularity(matches, "all")).toEqual([]);
  });

  it("sums goals for/against per club across every side that used it, league-wide", () => {
    const matches = [
      makeMatch({ playerIds: ["a"], score: 2, result: "win", clubId: "barca", clubName: "Barcelona" }, { playerIds: ["b"], score: 1, result: "loss", clubId: "real", clubName: "Real Madrid" }),
      makeMatch({ playerIds: ["c"], score: 0, result: "loss", clubId: "barca", clubName: "Barcelona" }, { playerIds: ["d"], score: 3, result: "win", clubId: "real", clubName: "Real Madrid" }),
    ];
    const rows = calculateClubPopularity(matches, "all");
    expect(rows.find((r) => r.clubId === "barca")).toMatchObject({ goalsFor: 2, goalsAgainst: 4 });
    expect(rows.find((r) => r.clubId === "real")).toMatchObject({ goalsFor: 4, goalsAgainst: 2 });
  });
});

describe("calculateWeekdayActivity / calculateHourlyActivity", () => {
  it("buckets matches by local day of week and hour", () => {
    // 2026-07-27 is a Monday.
    const monday9am = new Date(2026, 6, 27, 9).toISOString();
    const monday9pm = new Date(2026, 6, 27, 21).toISOString();
    const matches = [makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: monday9am }), makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: monday9pm })];

    const weekdays = calculateWeekdayActivity(matches, "all", new Date(2026, 6, 28));
    expect(weekdays.find((r) => r.day === 1)?.matches).toBe(2); // Monday

    const hours = calculateHourlyActivity(matches, "all", new Date(2026, 6, 28));
    expect(hours.find((r) => r.hour === 9)?.matches).toBe(1);
    expect(hours.find((r) => r.hour === 21)?.matches).toBe(1);
  });

  it("returns 7/24 zeroed rows respectively for an empty history", () => {
    expect(calculateWeekdayActivity([], "all")).toHaveLength(7);
    expect(calculateHourlyActivity([], "all")).toHaveLength(24);
  });
});

describe("calculateMonthlyActivity", () => {
  it("groups matches by calendar month, oldest first, only for months with matches", () => {
    const matches = [
      makeMatch(win(["a"], 2), loss(["b"], 1), { playedAt: new Date(2026, 4, 10).toISOString() }),
      makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: new Date(2026, 5, 5).toISOString() }),
      makeMatch(win(["a"], 3), loss(["b"], 2), { playedAt: new Date(2026, 5, 20).toISOString() }),
    ];
    const rows = calculateMonthlyActivity(matches, "all", new Date(2026, 6, 1));
    expect(rows).toEqual([
      { year: 2026, month: 4, matches: 1, totalGoals: 3 },
      { year: 2026, month: 5, matches: 2, totalGoals: 1 + 0 + 3 + 2 },
    ]);
  });
});

describe("calculateTopScorersTimeline", () => {
  const now = new Date(2026, 6, 27, 12);

  it("picks the highest scorer per bucket from the match data itself, no roster required", () => {
    const matches = [
      makeMatch({ playerIds: ["a"], score: 4, result: "win" }, { playerIds: ["b"], score: 1, result: "loss" }, { playedAt: now.toISOString() }),
      makeMatch({ playerIds: ["c"], score: 1, result: "win" }, { playerIds: ["d"], score: 0, result: "loss" }, { playedAt: now.toISOString() }),
    ];
    const points = calculateTopScorersTimeline(matches, "7d", now);
    expect(points.at(-1)).toMatchObject({ playerId: "a", playerName: "a", goals: 4 });
  });

  it("still identifies a top scorer who has since been archived/deleted from the live roster", () => {
    const matches = [makeMatch({ playerIds: ["ghost"], score: 5, result: "win" }, { playerIds: ["b"], score: 0, result: "loss" }, { playedAt: now.toISOString() })];
    const points = calculateTopScorersTimeline(matches, "7d", now);
    expect(points.at(-1)).toMatchObject({ playerId: "ghost", goals: 5 });
  });

  it("reports null player/name and 0 goals for a bucket with no matches", () => {
    const points = calculateTopScorersTimeline([], "7d", now);
    expect(points.every((p) => p.playerId === null && p.playerName === null && p.goals === 0)).toBe(true);
  });
});

describe("calculateWinRateEvolution", () => {
  const now = new Date(2026, 6, 27, 12);

  it("matches calculatePlayerWinRateTimeline's own output per player", () => {
    const matches = [makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: now.toISOString() })];
    const rows = calculateWinRateEvolution(roster(["a", "b"]), matches, "7d", now);
    const aRow = rows.find((r) => r.playerId === "a")!;
    expect(aRow.timeline.at(-1)!.value).toBe(1);
  });

  it("omits roster members with zero matches in range", () => {
    const matches = [makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: now.toISOString() })];
    const rows = calculateWinRateEvolution(roster(["a", "b", "c"]), matches, "7d", now);
    expect(rows.map((r) => r.playerId)).toEqual(["a", "b"]);
  });
});

describe("calculateLeagueAnalytics", () => {
  const now = new Date(2026, 6, 27, 12);

  it("does not throw and returns a fully zeroed summary for an empty history", () => {
    expect(() => calculateLeagueAnalytics(roster(["a", "b"]), [], "all", now)).not.toThrow();
    const summary = calculateLeagueAnalytics(roster(["a", "b"]), [], "all", now);
    expect(summary.matchesConsidered).toBe(0);
    expect(summary.totalGoals).toBe(0);
    expect(summary.playersCount).toBe(2);
    expect(summary.playerParticipation.every((r) => r.matchesPlayed === 0)).toBe(true);
  });

  it("aggregates a mixed singles/doubles history correctly", () => {
    const matches = [
      makeMatch(win(["a"], 2), loss(["b"], 1), { playedAt: now.toISOString(), matchType: "singles" }),
      makeMatch(win(["a", "c"], 3), loss(["b", "d"], 0), { playedAt: now.toISOString(), matchType: "doubles" }),
    ];
    const summary = calculateLeagueAnalytics(roster(["a", "b", "c", "d"]), matches, "all", now);
    expect(summary.matchesConsidered).toBe(2);
    expect(summary.totalGoals).toBe(2 + 1 + 3 + 0);
  });
});
