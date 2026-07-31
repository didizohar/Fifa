import {
  calculatePlayerGoalsPerMatchTimeline,
  calculatePlayerPointsTimeline,
  calculatePlayerTrendMetricTimeline,
  calculatePlayerWinsTimeline,
  calculateTrendSeriesForPlayers,
  TREND_METRIC_KEYS,
} from "../../src/lib/trends/trendSeries";
import type { MatchSidePlayer, MatchSummary } from "../../src/lib/matches";

function player(id: string): MatchSidePlayer {
  return { id, display_name: id, avatar_url: null, custom_color: "#000" };
}

function makeMatch(playerId: string, opponentId: string, score: number, opponentScore: number, result: "win" | "loss" | "draw", playedAt: string): MatchSummary {
  return {
    id: `match-${playerId}-${playedAt}`,
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: playedAt,
    sides: [
      { id: `s1-${playedAt}`, side_number: 1, score, penalty_score: null, result, club: null, players: [player(playerId)] },
      {
        id: `s2-${playedAt}`,
        side_number: 2,
        score: opponentScore,
        penalty_score: null,
        result: result === "win" ? "loss" : result === "loss" ? "win" : "draw",
        club: null,
        players: [player(opponentId)],
      },
    ],
  };
}

// All within the last 7 days of `now`, so the "7d" range's daily buckets contain them.
const NOW = new Date(2026, 5, 15, 12, 0, 0);
const DAY1 = new Date(2026, 5, 13).toISOString();
const DAY2 = new Date(2026, 5, 14).toISOString();

describe("calculatePlayerWinsTimeline / GoalsPerMatchTimeline / PointsTimeline", () => {
  const matches = [
    makeMatch("p1", "p2", 3, 1, "win", DAY1),
    makeMatch("p1", "p2", 2, 2, "draw", DAY2),
  ];

  it("wins timeline counts 1 for a win bucket and 0 for a non-win bucket", () => {
    const timeline = calculatePlayerWinsTimeline("p1", matches, "7d", NOW);
    const day1 = timeline.find((p) => p.bucketStart === "2026-06-13")!;
    const day2 = timeline.find((p) => p.bucketStart === "2026-06-14")!;
    expect(day1.value).toBe(1);
    expect(day2.value).toBe(0);
  });

  it("goals-per-match timeline is goalsFor divided by matches in that bucket", () => {
    const timeline = calculatePlayerGoalsPerMatchTimeline("p1", matches, "7d", NOW);
    const day1 = timeline.find((p) => p.bucketStart === "2026-06-13")!;
    expect(day1.value).toBe(3); // 1 match, 3 goals -> 3 per match
  });

  it("is 0 (not NaN) for a goals-per-match bucket with no matches", () => {
    const timeline = calculatePlayerGoalsPerMatchTimeline("p1", matches, "7d", NOW);
    const emptyBucket = timeline.find((p) => p.matchesInBucket === 0);
    expect(emptyBucket?.value).toBe(0);
  });

  it("points timeline awards 3 for a win and 1 for a draw", () => {
    const timeline = calculatePlayerPointsTimeline("p1", matches, "7d", NOW);
    const day1 = timeline.find((p) => p.bucketStart === "2026-06-13")!;
    const day2 = timeline.find((p) => p.bucketStart === "2026-06-14")!;
    expect(day1.value).toBe(3);
    expect(day2.value).toBe(1);
  });
});

describe("calculatePlayerTrendMetricTimeline", () => {
  const matches = [makeMatch("p1", "p2", 4, 1, "win", DAY1)];

  it.each(TREND_METRIC_KEYS)("dispatches to a valid timeline for metric '%s' without throwing", (metric) => {
    expect(() => calculatePlayerTrendMetricTimeline(metric, "p1", matches, "7d", NOW)).not.toThrow();
  });

  it("matches the dedicated function's output for goalDifference", () => {
    const timeline = calculatePlayerTrendMetricTimeline("goalDifference", "p1", matches, "7d", NOW);
    const day1 = timeline.find((p) => p.bucketStart === "2026-06-13")!;
    expect(day1.value).toBe(3); // 4 - 1
  });

  it("matches leaguePoints against calculatePlayerPointsTimeline exactly", () => {
    const dispatched = calculatePlayerTrendMetricTimeline("leaguePoints", "p1", matches, "7d", NOW);
    const dedicated = calculatePlayerPointsTimeline("p1", matches, "7d", NOW);
    expect(dispatched).toEqual(dedicated);
  });
});

describe("calculateTrendSeriesForPlayers", () => {
  const roster = [player("p1"), player("p2"), player("p3")];
  const matches = [makeMatch("p1", "p2", 4, 1, "win", DAY1)];

  it("returns one series per player who has at least one match in range", () => {
    const series = calculateTrendSeriesForPlayers("winRate", roster, matches, "7d", NOW);
    expect(series.map((s) => s.playerId).sort()).toEqual(["p1", "p2"]);
  });

  it("omits a player with zero matches anywhere in the bucketed span", () => {
    const series = calculateTrendSeriesForPlayers("winRate", roster, matches, "7d", NOW);
    expect(series.some((s) => s.playerId === "p3")).toBe(false);
  });

  it("includes the player's display name alongside their timeline", () => {
    const series = calculateTrendSeriesForPlayers("wins", roster, matches, "7d", NOW);
    const p1Series = series.find((s) => s.playerId === "p1")!;
    expect(p1Series.playerName).toBe("p1");
    expect(p1Series.points.some((p) => p.value === 1)).toBe(true);
  });

  it("returns an empty array for an empty player list", () => {
    expect(calculateTrendSeriesForPlayers("winRate", [], matches, "7d", NOW)).toEqual([]);
  });
});
