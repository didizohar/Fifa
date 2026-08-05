import { computeHighestEligibleWinRate, computeMonthlySummary, computeMostSelectedClub, compareToPreviousMonth } from "../src/lib/monthlySummary";
import type { MatchSidePlayer, MatchSummary } from "../src/lib/matches";

function player(id: string): MatchSidePlayer {
  return { id, display_name: id, avatar_url: null, custom_color: "#000" };
}

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
  club?: { id: string; name: string } | null;
}

function makeMatch(side1: SideSpec, side2: SideSpec, playedAt: string): MatchSummary {
  const toSide = (spec: SideSpec, sideNumber: 1 | 2) => ({
    id: `side-${sideNumber}-${playedAt}-${spec.playerIds.join("")}`,
    side_number: sideNumber,
    score: spec.score,
    penalty_score: null,
    result: spec.result,
    club: spec.club ?? null,
    players: spec.playerIds.map((id) => player(id)),
  });
  return {
    id: `match-${playedAt}-${side1.playerIds.join("")}-${side2.playerIds.join("")}`,
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: playedAt,
    sides: [toSide(side1, 1), toSide(side2, 2)],
  };
}

describe("compareToPreviousMonth", () => {
  it("computes exact absolute and percent changes", () => {
    const cmp = compareToPreviousMonth(15, 10);
    expect(cmp).toEqual({ current: 15, previous: 10, absoluteChange: 5, percentChange: 50 });
  });

  it("reports a null previous/comparison when there is nothing to compare against", () => {
    expect(compareToPreviousMonth(8, null)).toEqual({ current: 8, previous: null, absoluteChange: null, percentChange: null });
  });

  it("computes an absolute change but a null percent change when previous is exactly 0", () => {
    expect(compareToPreviousMonth(4, 0)).toEqual({ current: 4, previous: 0, absoluteChange: 4, percentChange: null });
  });
});

describe("computeMostSelectedClub", () => {
  it("picks the club used in the most side-appearances", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win", club: { id: "arsenal", name: "Arsenal" } }, { playerIds: ["p2"], score: 0, result: "loss", club: { id: "chelsea", name: "Chelsea" } }, "2026-03-01"),
      makeMatch({ playerIds: ["p1"], score: 2, result: "win", club: { id: "arsenal", name: "Arsenal" } }, { playerIds: ["p2"], score: 1, result: "loss", club: { id: "barca", name: "Barcelona" } }, "2026-03-02"),
    ];
    expect(computeMostSelectedClub(matches)).toEqual({ clubId: "arsenal", clubName: "Arsenal", matchesPlayed: 2 });
  });

  it("returns null when no match in the set used a club", () => {
    const matches = [makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, "2026-03-01")];
    expect(computeMostSelectedClub(matches)).toBeNull();
  });
});

describe("computeHighestEligibleWinRate", () => {
  const roster = [player("p1"), player("p2")];

  it("returns null when nobody has enough matches to qualify", () => {
    const matches = [makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, "2026-03-01")];
    expect(computeHighestEligibleWinRate(roster, matches)).toBeNull();
  });

  it("returns the qualifying player with the highest win rate", () => {
    const matches = Array.from({ length: 5 }, (_, i) =>
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, `2026-03-0${i + 1}`),
    );
    expect(computeHighestEligibleWinRate(roster, matches)).toEqual({ playerName: "p1", winRate: 1 });
  });
});

describe("computeMonthlySummary", () => {
  const roster = [player("p1"), player("p2"), player("p3")];

  it("reports zero matches/goals gracefully for a month with no data at all", () => {
    const summary = computeMonthlySummary(roster, [], [], 2026, 2);
    // matchesPlayed/totalGoals are always real (possibly-zero) counts, even
    // for an empty previous month -- only an *average* over zero matches is
    // undefined (see the averageGoalsPerMatch expectation below).
    expect(summary.matchesPlayed).toEqual({ current: 0, previous: 0, absoluteChange: 0, percentChange: null });
    expect(summary.totalGoals).toEqual({ current: 0, previous: 0, absoluteChange: 0, percentChange: null });
    expect(summary.averageGoalsPerMatch).toEqual({ current: 0, previous: null, absoluteChange: null, percentChange: null });
    expect(summary.highestEligibleWinRate).toBeNull();
    expect(summary.highestScoringMatch).toBeNull();
    expect(summary.mostSelectedClub).toBeNull();
  });

  it("computes matches/goals/average for the target month and compares against the previous month", () => {
    const matches = [
      // March 2026 (month index 2): 2 matches, 4 goals total
      makeMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, new Date(2026, 2, 1).toISOString()),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, new Date(2026, 2, 2).toISOString()),
      // February 2026 (month index 1): 1 match, 2 goals total
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 1, result: "draw" }, new Date(2026, 1, 1).toISOString()),
    ];
    const summary = computeMonthlySummary(roster, matches, [], 2026, 2);

    expect(summary.matchesPlayed).toEqual({ current: 2, previous: 1, absoluteChange: 1, percentChange: 100 });
    expect(summary.totalGoals).toEqual({ current: 4, previous: 2, absoluteChange: 2, percentChange: 100 });
    expect(summary.averageGoalsPerMatch).toEqual({ current: 2, previous: 2, absoluteChange: 0, percentChange: 0 });
  });

  it("treats a previous month with zero matches as 'insufficient data' for the average (null previous), not a divide-by-zero crash", () => {
    const matches = [makeMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, new Date(2026, 2, 1).toISOString())];
    const summary = computeMonthlySummary(roster, matches, [], 2026, 2);
    expect(summary.averageGoalsPerMatch.previous).toBeNull();
    expect(summary.averageGoalsPerMatch.percentChange).toBeNull();
    expect(summary.averageGoalsPerMatch.current).toBe(3);
  });

  it("counts completed sessions in the target month vs the previous month", () => {
    const sessionTimestamps = [
      new Date(2026, 2, 5).toISOString(),
      new Date(2026, 2, 10).toISOString(),
      new Date(2026, 1, 20).toISOString(),
    ];
    const summary = computeMonthlySummary(roster, [], sessionTimestamps, 2026, 2);
    expect(summary.sessionsCompleted).toEqual({ current: 2, previous: 1, absoluteChange: 1, percentChange: 100 });
  });

  it("identifies the highest-scoring match within the target month only", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 5, result: "win" }, { playerIds: ["p2"], score: 4, result: "loss" }, new Date(2026, 2, 1).toISOString()),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, new Date(2026, 2, 2).toISOString()),
      // Higher-scoring, but in a different month -- must not be picked.
      makeMatch({ playerIds: ["p1"], score: 9, result: "win" }, { playerIds: ["p2"], score: 9, result: "draw" }, new Date(2026, 1, 1).toISOString()),
    ];
    const summary = computeMonthlySummary(roster, matches, [], 2026, 2);
    expect(summary.highestScoringMatch?.valueLabelParams.goals).toBe(9);
  });

  it("still exposes the existing monthly report's awards (player of month, top scorer, etc.) unchanged", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, new Date(2026, 2, 1).toISOString()),
      makeMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p3"], score: 1, result: "loss" }, new Date(2026, 2, 2).toISOString()),
    ];
    const summary = computeMonthlySummary(roster, matches, [], 2026, 2);
    expect(summary.report.playerOfMonthName).toBe("p1");
    expect(summary.report.topScorerName).toBe("p1");
    expect(summary.report.topScorerGoals).toBe(5);
  });
});
