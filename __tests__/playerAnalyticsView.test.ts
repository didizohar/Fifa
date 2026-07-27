import {
  computeFormScore,
  countFormOutcomes,
  hasUnparseableOwnMatchDates,
  resolvePlayerAnalyticsNotices,
  selectTimelineAxisLabelIndices,
  sortOpponentPerformance,
  summarizeTimelineTrend,
} from "../src/lib/playerAnalyticsView";
import type { OpponentPerformance, TimelinePoint } from "../src/lib/analytics/types";
import type { MatchSummary } from "../src/lib/matches";
import type { FormEntry } from "../src/lib/stats";

function point(value: number, matchesInBucket: number, bucketStart = "2026-07-01"): TimelinePoint {
  return { bucketStart, label: bucketStart, value, matchesInBucket };
}

describe("selectTimelineAxisLabelIndices", () => {
  it("returns nothing for zero points", () => {
    expect(selectTimelineAxisLabelIndices(0)).toEqual([]);
  });

  it("returns every index when count is within the max", () => {
    expect(selectTimelineAxisLabelIndices(1, 5)).toEqual([0]);
    expect(selectTimelineAxisLabelIndices(5, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it("always includes the first and last index, evenly spread in between", () => {
    const indices = selectTimelineAxisLabelIndices(30, 5);
    expect(indices).toHaveLength(5);
    expect(indices[0]).toBe(0);
    expect(indices.at(-1)).toBe(29);
    // strictly increasing, no duplicates
    expect(indices).toEqual([...new Set(indices)].sort((a, b) => a - b));
  });

  it("never returns more than maxLabels indices", () => {
    for (const count of [6, 7, 12, 30, 90]) {
      expect(selectTimelineAxisLabelIndices(count, 5).length).toBeLessThanOrEqual(5);
    }
  });
});

describe("summarizeTimelineTrend", () => {
  it("returns null when every bucket is empty (no data, not a real low point)", () => {
    expect(summarizeTimelineTrend([point(0, 0), point(0, 0)])).toBeNull();
  });

  it("ignores empty buckets when computing first/last/min/max", () => {
    const points = [point(10, 0), point(20, 2), point(5, 0), point(40, 1)];
    const summary = summarizeTimelineTrend(points);
    expect(summary).toEqual({ first: point(20, 2), last: point(40, 1), min: 20, max: 40 });
  });

  it("handles a single data point", () => {
    const summary = summarizeTimelineTrend([point(15, 1)]);
    expect(summary).toEqual({ first: point(15, 1), last: point(15, 1), min: 15, max: 15 });
  });
});

describe("countFormOutcomes / computeFormScore", () => {
  const form: FormEntry[] = [
    { matchId: "1", result: "win", playedAt: "2026-01-01" },
    { matchId: "2", result: "win", playedAt: "2026-01-02" },
    { matchId: "3", result: "draw", playedAt: "2026-01-03" },
    { matchId: "4", result: "loss", playedAt: "2026-01-04" },
  ];

  it("tallies wins/draws/losses", () => {
    expect(countFormOutcomes(form)).toEqual({ wins: 2, draws: 1, losses: 1 });
  });

  it("weights form score 3/1/0 for win/draw/loss", () => {
    expect(computeFormScore(form)).toBe(2 * 3 + 1);
  });

  it("handles an empty form", () => {
    expect(countFormOutcomes([])).toEqual({ wins: 0, draws: 0, losses: 0 });
    expect(computeFormScore([])).toBe(0);
  });
});

describe("sortOpponentPerformance", () => {
  const rows: OpponentPerformance[] = [
    { opponentId: "a", opponentName: "a", played: 10, wins: 6, losses: 4, draws: 0, winRate: 0.6, goalsFor: 10, goalsAgainst: 8, goalDifference: 2 },
    { opponentId: "b", opponentName: "b", played: 3, wins: 3, losses: 0, draws: 0, winRate: 1, goalsFor: 9, goalsAgainst: 1, goalDifference: 8 },
    { opponentId: "c", opponentName: "c", played: 5, wins: 1, losses: 4, draws: 0, winRate: 0.2, goalsFor: 3, goalsAgainst: 10, goalDifference: -7 },
  ];

  it("mostPlayed sorts by played descending", () => {
    expect(sortOpponentPerformance(rows, "mostPlayed").map((r) => r.opponentId)).toEqual(["a", "c", "b"]);
  });

  it("bestWinRate sorts by winRate descending", () => {
    expect(sortOpponentPerformance(rows, "bestWinRate").map((r) => r.opponentId)).toEqual(["b", "a", "c"]);
  });

  it("worstMatchup sorts by winRate ascending", () => {
    expect(sortOpponentPerformance(rows, "worstMatchup").map((r) => r.opponentId)).toEqual(["c", "a", "b"]);
  });

  it("goalDifference sorts by goalDifference descending", () => {
    expect(sortOpponentPerformance(rows, "goalDifference").map((r) => r.opponentId)).toEqual(["b", "a", "c"]);
  });

  it("does not mutate the original array", () => {
    const original = [...rows];
    sortOpponentPerformance(rows, "bestWinRate");
    expect(rows).toEqual(original);
  });
});

describe("resolvePlayerAnalyticsNotices", () => {
  it("returns no notices for a healthy, well-populated player", () => {
    expect(resolvePlayerAnalyticsNotices({ matchesConsidered: 20, isArchived: false, hasUnparseableDates: false })).toEqual([]);
  });

  it("flags archived first, then the sample-size tier, then legacy data", () => {
    expect(resolvePlayerAnalyticsNotices({ matchesConsidered: 0, isArchived: true, hasUnparseableDates: true })).toEqual(["archivedPlayer", "noMatches", "legacyDataExcluded"]);
  });

  it("distinguishes zero, one, and a few matches", () => {
    expect(resolvePlayerAnalyticsNotices({ matchesConsidered: 0, isArchived: false, hasUnparseableDates: false })).toEqual(["noMatches"]);
    expect(resolvePlayerAnalyticsNotices({ matchesConsidered: 1, isArchived: false, hasUnparseableDates: false })).toEqual(["oneMatchOnly"]);
    expect(resolvePlayerAnalyticsNotices({ matchesConsidered: 2, isArchived: false, hasUnparseableDates: false })).toEqual(["insufficientSample"]);
    expect(resolvePlayerAnalyticsNotices({ matchesConsidered: 3, isArchived: false, hasUnparseableDates: false })).toEqual([]);
  });
});

describe("hasUnparseableOwnMatchDates", () => {
  function makeMatch(playerIds: string[], playedAt: string): MatchSummary {
    return {
      id: `match-${Math.random()}`,
      match_type: "singles",
      is_overtime: false,
      is_penalties: false,
      notes: null,
      played_at: playedAt,
      sides: [
        { id: "s1", side_number: 1, score: 1, penalty_score: null, result: "win", club: null, players: playerIds.map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" })) },
        { id: "s2", side_number: 2, score: 0, penalty_score: null, result: "loss", club: null, players: [{ id: "other", display_name: "other", avatar_url: null, custom_color: "#000" }] },
      ],
    };
  }

  it("is false when the player has no matches or all dates are valid", () => {
    expect(hasUnparseableOwnMatchDates("a", [])).toBe(false);
    expect(hasUnparseableOwnMatchDates("a", [makeMatch(["a"], new Date().toISOString())])).toBe(false);
  });

  it("is true only when one of the PLAYER's OWN matches has an invalid date", () => {
    const notMine = makeMatch(["someone-else"], "not-a-date");
    expect(hasUnparseableOwnMatchDates("a", [notMine])).toBe(false);

    const mine = makeMatch(["a"], "not-a-date");
    expect(hasUnparseableOwnMatchDates("a", [mine])).toBe(true);
  });
});
