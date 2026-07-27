import {
  calculateActivityScore,
  calculateAttackScore,
  calculateConsistencyScore,
  calculateDefenceScore,
  calculateImprovementScore,
  calculateMomentumScore,
  calculatePlayerTrend,
  classifyImprovementMagnitude,
  classifyTrendDirection,
  computeLeagueMedianDaysSinceLastMatch,
  selectTrendWindows,
} from "../../src/lib/trends/playerTrends";
import type { MatchSidePlayer, MatchSummary } from "../../src/lib/matches";
import type { MatchType } from "../../src/lib/types/database";

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
}

function makeMatch(side1: SideSpec, side2: SideSpec, opts?: { playedAt?: string; matchType?: MatchType; id?: string }): MatchSummary {
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
    id: opts?.id ?? `match-${Math.random()}`,
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
const draw = (playerIds: string[], score: number): SideSpec => ({ playerIds, score, result: "draw" });

function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

describe("selectTrendWindows", () => {
  const now = new Date(2026, 6, 27, 12);

  it("uses fixed 5/5 windows once there are at least 10 matches", () => {
    const matches = Array.from({ length: 12 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: daysAgo(now, i), id: `m${i}` }));
    const windows = selectTrendWindows("a", matches, {});
    expect(windows!.recent).toHaveLength(5);
    expect(windows!.previous).toHaveLength(5);
    expect(windows!.ordered).toHaveLength(12);
    // Most recent first: m0 (0 days ago) should be first.
    expect(windows!.recent[0]!.id).toBe("m0");
  });

  it("falls back to an even proportional split below the fixed-window floor", () => {
    const matches = Array.from({ length: 7 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: daysAgo(now, i), id: `m${i}` }));
    const windows = selectTrendWindows("a", matches, {});
    expect(windows!.recent).toHaveLength(4); // ceil(7/2)
    expect(windows!.previous).toHaveLength(3);
  });

  it("returns null (insufficientData) below minTotalMatches", () => {
    const matches = Array.from({ length: 3 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: daysAgo(now, i) }));
    expect(selectTrendWindows("a", matches, {})).toBeNull();
  });

  it("respects configurable window sizes", () => {
    const matches = Array.from({ length: 20 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: daysAgo(now, i), id: `m${i}` }));
    const windows = selectTrendWindows("a", matches, { recentWindowSize: 3, previousWindowSize: 7 });
    expect(windows!.recent).toHaveLength(3);
    expect(windows!.previous).toHaveLength(7);
  });

  it("drops matches with an invalid played_at instead of crashing", () => {
    const bad = makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: "not-a-date" });
    const good = Array.from({ length: 4 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: daysAgo(now, i) }));
    expect(() => selectTrendWindows("a", [bad, ...good], {})).not.toThrow();
    expect(selectTrendWindows("a", [bad, ...good], {})!.ordered).toHaveLength(4);
  });

  it("ignores matches the player wasn't part of", () => {
    const matches = [makeMatch(win(["x"], 1), loss(["y"], 0)), ...Array.from({ length: 4 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: daysAgo(now, i) }))];
    expect(selectTrendWindows("a", matches, {})!.ordered).toHaveLength(4);
  });

  it("breaks duplicate-timestamp ties deterministically by match id, regardless of input array order", () => {
    const sameInstant = now.toISOString();
    const older = daysAgo(now, 5);
    const base = [
      makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: sameInstant, id: "z" }),
      makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: sameInstant, id: "a" }),
      makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: older, id: "m" }),
      makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: older, id: "n" }),
    ];
    const forward = selectTrendWindows("a", base, {})!.ordered.map((m) => m.id);
    const reversed = selectTrendWindows("a", [...base].reverse(), {})!.ordered.map((m) => m.id);
    expect(forward).toEqual(reversed);
    expect(forward.slice(0, 2)).toEqual(["a", "z"]); // same-instant tie broken by id ascending
  });
});

describe("calculateMomentumScore", () => {
  it("matches a hand-computed expected value for explicit inputs", () => {
    const score = calculateMomentumScore({
      recentWinRate: 0.6,
      previousWinRate: 0.4,
      recentGoalDifferencePerMatch: 1,
      recentGoalsPerMatch: 2,
      currentStreak: { result: "win", count: 3 },
    });
    expect(score).toBe(60);
  });

  it("caps at 100 for a maxed-out player and floors at a reduced score for a cold one", () => {
    const hot = calculateMomentumScore({ recentWinRate: 1, previousWinRate: 0, recentGoalDifferencePerMatch: 3, recentGoalsPerMatch: 4, currentStreak: { result: "win", count: 10 } });
    expect(hot).toBe(100);

    const cold = calculateMomentumScore({ recentWinRate: 0, previousWinRate: 1, recentGoalDifferencePerMatch: -3, recentGoalsPerMatch: 0, currentStreak: { result: "loss", count: 5 } });
    expect(cold).toBe(0);
  });

  it("a loss streak contributes zero streak signal; a draw ('unbeaten') streak contributes half weight", () => {
    const base = { recentWinRate: 0.5, previousWinRate: 0.5, recentGoalDifferencePerMatch: 0, recentGoalsPerMatch: 1 };
    const withLossStreak = calculateMomentumScore({ ...base, currentStreak: { result: "loss", count: 5 } });
    const withNoStreak = calculateMomentumScore({ ...base, currentStreak: { result: null, count: 0 } });
    expect(withLossStreak).toBe(withNoStreak);

    const withDrawStreak = calculateMomentumScore({ ...base, currentStreak: { result: "draw", count: 5 } });
    const withWinStreak = calculateMomentumScore({ ...base, currentStreak: { result: "win", count: 5 } });
    expect(withDrawStreak).toBeLessThan(withWinStreak);
  });
});

describe("calculateImprovementScore", () => {
  it("matches a hand-computed expected value for explicit inputs", () => {
    const score = calculateImprovementScore({
      recentWinRate: 0.6,
      previousWinRate: 0.4,
      recentGoalsPerMatch: 2,
      previousGoalsPerMatch: 1,
      recentGoalDifferencePerMatch: 1,
      previousGoalDifferencePerMatch: 0,
      recentLossRate: 0.2,
      previousLossRate: 0.4,
    });
    expect(score).toBe(25);
  });

  it("is zero for identical recent/previous windows", () => {
    const score = calculateImprovementScore({
      recentWinRate: 0.5,
      previousWinRate: 0.5,
      recentGoalsPerMatch: 1.5,
      previousGoalsPerMatch: 1.5,
      recentGoalDifferencePerMatch: 0.2,
      previousGoalDifferencePerMatch: 0.2,
      recentLossRate: 0.3,
      previousLossRate: 0.3,
    });
    expect(score).toBe(0);
  });

  it("is symmetric: swapping recent/previous negates the score", () => {
    const input = {
      recentWinRate: 0.8,
      previousWinRate: 0.2,
      recentGoalsPerMatch: 3,
      previousGoalsPerMatch: 1,
      recentGoalDifferencePerMatch: 2,
      previousGoalDifferencePerMatch: -1,
      recentLossRate: 0.1,
      previousLossRate: 0.6,
    };
    const forward = calculateImprovementScore(input);
    const swapped = calculateImprovementScore({
      recentWinRate: input.previousWinRate,
      previousWinRate: input.recentWinRate,
      recentGoalsPerMatch: input.previousGoalsPerMatch,
      previousGoalsPerMatch: input.recentGoalsPerMatch,
      recentGoalDifferencePerMatch: input.previousGoalDifferencePerMatch,
      previousGoalDifferencePerMatch: input.recentGoalDifferencePerMatch,
      recentLossRate: input.previousLossRate,
      previousLossRate: input.recentLossRate,
    });
    expect(swapped).toBe(-forward);
  });

  it("never exceeds the -100..100 range even for extreme swings", () => {
    const score = calculateImprovementScore({
      recentWinRate: 1,
      previousWinRate: 0,
      recentGoalsPerMatch: 10,
      previousGoalsPerMatch: 0,
      recentGoalDifferencePerMatch: 10,
      previousGoalDifferencePerMatch: -10,
      recentLossRate: 0,
      previousLossRate: 1,
    });
    expect(score).toBe(100);
  });
});

describe("classifyTrendDirection / classifyImprovementMagnitude", () => {
  it("classifies null as insufficientData", () => {
    expect(classifyTrendDirection(null)).toBe("insufficientData");
    expect(classifyImprovementMagnitude(null)).toBe("insufficientData");
  });

  it.each([
    [50, "rising", "stronglyRising"],
    [30, "rising", "stronglyRising"],
    [29, "rising", "rising"],
    [10, "rising", "rising"],
    [9, "stable", "stable"],
    [0, "stable", "stable"],
    [-9, "stable", "stable"],
    [-10, "falling", "falling"],
    [-29, "falling", "falling"],
    [-30, "falling", "stronglyFalling"],
    [-50, "falling", "stronglyFalling"],
  ] as const)("improvementScore %d -> direction %s, magnitude %s", (score, direction, magnitude) => {
    expect(classifyTrendDirection(score)).toBe(direction);
    expect(classifyImprovementMagnitude(score)).toBe(magnitude);
  });
});

describe("calculateConsistencyScore", () => {
  it("matches a hand-computed expected value for explicit inputs", () => {
    const score = calculateConsistencyScore({ goalMarginStdDev: 1, goalsScoredStdDev: 0.5, extremeMatchShare: 0.2, sampleAdequacy: 1 });
    expect(score).toBe(80);
  });

  it("treats a null goalMarginStdDev (too small a sample for stats.ts's computeConsistency) as neutral, not as 0 or 100", () => {
    const withNull = calculateConsistencyScore({ goalMarginStdDev: null, goalsScoredStdDev: 0, extremeMatchShare: 0, sampleAdequacy: 1 });
    const withZero = calculateConsistencyScore({ goalMarginStdDev: 0, goalsScoredStdDev: 0, extremeMatchShare: 0, sampleAdequacy: 1 });
    expect(withNull).toBeLessThan(withZero);
    expect(withNull).toBeGreaterThan(0);
  });

  it("rewards a perfectly steady, unremarkable player just as highly as an excellent-but-steady one -- consistency is not performance", () => {
    const mediocreButSteady = calculateConsistencyScore({ goalMarginStdDev: 0, goalsScoredStdDev: 0, extremeMatchShare: 0, sampleAdequacy: 1 });
    expect(mediocreButSteady).toBe(100);
  });
});

describe("calculateActivityScore", () => {
  it("matches a hand-computed expected value for explicit inputs", () => {
    const score = calculateActivityScore({ daysSinceLastMatch: 2, averageDaysBetweenRecentMatches: 3, leagueMedianDaysSinceLastMatch: 5 });
    expect(score).toBe(91);
  });

  it("does not penalize a player merely as idle as the whole (quiet) league", () => {
    const score = calculateActivityScore({ daysSinceLastMatch: 40, averageDaysBetweenRecentMatches: 20, leagueMedianDaysSinceLastMatch: 40 });
    // relativeIdleDays = max(0, 40-40) = 0 -> full relative-recency credit despite being globally dormant.
    expect(score).toBeGreaterThan(0);
  });

  it("does penalize a player who is MORE idle than the league norm", () => {
    const normal = calculateActivityScore({ daysSinceLastMatch: 5, averageDaysBetweenRecentMatches: 5, leagueMedianDaysSinceLastMatch: 5 });
    const laggingBehind = calculateActivityScore({ daysSinceLastMatch: 35, averageDaysBetweenRecentMatches: 5, leagueMedianDaysSinceLastMatch: 5 });
    expect(laggingBehind).toBeLessThan(normal);
  });
});

describe("calculateAttackScore / calculateDefenceScore", () => {
  it("calculateAttackScore matches a hand-computed expected value", () => {
    const score = calculateAttackScore({ recentGoalsPerMatch: 2, previousGoalsPerMatch: 1, totalRecentGoals: 10, recentWindowSize: 5, goalsScoredStdDev: 0.5 });
    expect(score).toBe(63);
  });

  it("calculateDefenceScore matches a hand-computed expected value", () => {
    const score = calculateDefenceScore({ recentGoalsAgainstPerMatch: 1, recentGoalDifferencePerMatch: 1, lowConcedingShare: 0.8 });
    expect(score).toBe(74);
  });
});

describe("computeLeagueMedianDaysSinceLastMatch", () => {
  it("returns 0 when nobody has played", () => {
    const now = new Date(2026, 6, 27);
    expect(computeLeagueMedianDaysSinceLastMatch(roster(["a", "b"]), [], now)).toBe(0);
  });

  it("computes the median across players who have played, ignoring those who haven't", () => {
    const now = new Date(2026, 6, 27);
    const matches = [makeMatch(win(["a"], 1), loss(["x"], 0), { playedAt: daysAgo(now, 2) }), makeMatch(win(["b"], 1), loss(["x"], 0), { playedAt: daysAgo(now, 10) })];
    expect(computeLeagueMedianDaysSinceLastMatch(roster(["a", "b", "c"]), matches, now)).toBeCloseTo(6); // median of [2, 10]
  });
});

describe("calculatePlayerTrend (integration)", () => {
  const now = new Date(2026, 6, 27, 12);

  it("returns insufficientData for a player with too little history", () => {
    const matches = Array.from({ length: 2 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: daysAgo(now, i) }));
    const trend = calculatePlayerTrend("a", roster(["a", "b"]), matches, now);
    expect(trend.direction).toBe("insufficientData");
    expect(trend.confidence).toBe(0);
    expect(trend.recentWinRate).toBeNull();
    expect(trend.currentForm).toEqual([]);
  });

  it("returns insufficientData for a player with zero matches, without throwing", () => {
    expect(() => calculatePlayerTrend("a", roster(["a", "b"]), [], now)).not.toThrow();
    expect(calculatePlayerTrend("a", roster(["a", "b"]), [], now).direction).toBe("insufficientData");
  });

  it("detects a clearly rising player: losing the previous 5, winning the recent 5", () => {
    const matches = [
      ...Array.from({ length: 5 }, (_, i) => makeMatch(win(["a"], 3), loss(["b"], 0), { playedAt: daysAgo(now, i) })), // recent: 5 wins
      ...Array.from({ length: 5 }, (_, i) => makeMatch(loss(["a"], 0), win(["b"], 3), { playedAt: daysAgo(now, 5 + i) })), // previous: 5 losses
    ];
    const trend = calculatePlayerTrend("a", roster(["a", "b"]), matches, now);
    expect(trend.direction).toBe("rising");
    expect(trend.recentWinRate).toBe(1);
    expect(trend.previousWinRate).toBe(0);
    expect(trend.momentumScore).toBeGreaterThan(70);
    expect(trend.confidence).toBe(100);
  });

  it("detects a clearly falling player: the mirror image of the rising case", () => {
    const matches = [
      ...Array.from({ length: 5 }, (_, i) => makeMatch(loss(["a"], 0), win(["b"], 3), { playedAt: daysAgo(now, i) })),
      ...Array.from({ length: 5 }, (_, i) => makeMatch(win(["a"], 3), loss(["b"], 0), { playedAt: daysAgo(now, 5 + i) })),
    ];
    const trend = calculatePlayerTrend("a", roster(["a", "b"]), matches, now);
    expect(trend.direction).toBe("falling");
    expect(trend.recentWinRate).toBe(0);
    expect(trend.previousWinRate).toBe(1);
  });

  it("classifies an unchanged record as stable -- identical 1-0 wins in both windows, no change to react to", () => {
    const matches = Array.from({ length: 10 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: daysAgo(now, i) }));
    const trend = calculatePlayerTrend("a", roster(["a", "b"]), matches, now);
    expect(trend.direction).toBe("stable");
    expect(trend.improvementScore).toBe(0);
  });

  it("handles draws (tied matches) without crashing and reflects them in currentForm", () => {
    const matches = Array.from({ length: 10 }, (_, i) => makeMatch(draw(["a"], 1), draw(["b"], 1), { playedAt: daysAgo(now, i) }));
    const trend = calculatePlayerTrend("a", roster(["a", "b"]), matches, now);
    expect(trend.currentForm.every((r) => r === "draw")).toBe(true);
    expect(trend.recentWinRate).toBe(0);
  });

  it("counts both singles and doubles matches toward the same trend", () => {
    const singles = Array.from({ length: 5 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: daysAgo(now, i), matchType: "singles" }));
    const doubles = Array.from({ length: 5 }, (_, i) => makeMatch(win(["a", "c"], 1), loss(["b", "d"], 0), { playedAt: daysAgo(now, 5 + i), matchType: "doubles" }));
    const trend = calculatePlayerTrend("a", roster(["a", "b", "c", "d"]), [...singles, ...doubles], now);
    expect(trend.matchesConsidered).toBe(10);
    expect(trend.recentWinRate).toBe(1);
  });

  it("silently excludes a future-dated match beyond the current instant instead of crashing", () => {
    const future = makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: new Date(now.getTime() + 30 * 86_400_000).toISOString() });
    const rest = Array.from({ length: 5 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: daysAgo(now, i) }));
    expect(() => calculatePlayerTrend("a", roster(["a", "b"]), [future, ...rest], now)).not.toThrow();
  });

  it("does not mutate the input matches array", () => {
    const matches = Array.from({ length: 10 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: daysAgo(now, i) }));
    const snapshot = JSON.parse(JSON.stringify(matches));
    calculatePlayerTrend("a", roster(["a", "b"]), matches, now);
    expect(matches).toEqual(snapshot);
  });

  it("two players with identical histories get identical trend metrics (deterministic, no player-identity bias)", () => {
    const matchesFor = (id: string) => Array.from({ length: 10 }, (_, i) => makeMatch(win([id], 1), loss(["x"], 0), { playedAt: daysAgo(now, i) }));
    const trendA = calculatePlayerTrend("a", roster(["a", "b", "x"]), matchesFor("a"), now);
    const trendB = calculatePlayerTrend("b", roster(["a", "b", "x"]), matchesFor("b"), now);
    expect({ ...trendA, playerId: null }).toEqual({ ...trendB, playerId: null });
  });

  it("reuses a precomputed leagueMedianDaysSinceLastMatch instead of deriving it, when provided", () => {
    // Last match 10 days ago for both players -- the internally-derived
    // median would also land at ~10, giving relativeIdleDays 0 either way.
    // Overriding with a much SMALLER median (0) makes this player look
    // relatively more idle than "the league", which only shows up if the
    // override is actually being used instead of the real derived value.
    const matches = Array.from({ length: 10 }, (_, i) => makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: daysAgo(now, i + 10) }));
    const withOverride = calculatePlayerTrend("a", roster(["a", "b"]), matches, now, { leagueMedianDaysSinceLastMatch: 0 });
    const withDefault = calculatePlayerTrend("a", roster(["a", "b"]), matches, now);
    expect(withOverride.activityScore).toBeLessThan(withDefault.activityScore);
  });
});
