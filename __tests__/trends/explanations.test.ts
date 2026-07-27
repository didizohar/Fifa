import { explainActivity, explainAttack, explainConsistency, explainDefence, explainDirection, explainMomentum } from "../../src/lib/trends/explanations";
import type { PlayerTrendMetrics } from "../../src/lib/trends/types";

function baseTrend(overrides: Partial<PlayerTrendMetrics> = {}): PlayerTrendMetrics {
  return {
    playerId: "a",
    direction: "stable",
    momentumScore: 50,
    improvementScore: 0,
    consistencyScore: 50,
    activityScore: 50,
    attackScore: 50,
    defenceScore: 50,
    recentWinRate: 0.5,
    previousWinRate: 0.5,
    recentGoalsPerMatch: 1.5,
    previousGoalsPerMatch: 1.5,
    recentGoalDifference: 0,
    previousGoalDifference: 0,
    currentForm: ["win", "loss", "win", "loss", "win"],
    matchesConsidered: 10,
    confidence: 100,
    ...overrides,
  };
}

describe("explainDirection", () => {
  it("returns the insufficientData key regardless of other fields", () => {
    expect(explainDirection(baseTrend({ direction: "insufficientData" }))).toEqual({ key: "trends.explanation.insufficientData", params: {} });
  });

  it("picks stronglyRising for a big positive improvementScore", () => {
    const trend = baseTrend({ direction: "rising", improvementScore: 40, recentWinRate: 0.7, previousWinRate: 0.4 });
    expect(explainDirection(trend)).toEqual({ key: "trends.explanation.stronglyRising", params: { previous: 40, recent: 70, matches: 10 } });
  });

  it("picks rising for a moderate positive improvementScore", () => {
    const trend = baseTrend({ direction: "rising", improvementScore: 15 });
    expect(explainDirection(trend).key).toBe("trends.explanation.rising");
  });

  it("picks falling/stronglyFalling for negative improvementScore, and stable for near-zero", () => {
    expect(explainDirection(baseTrend({ direction: "falling", improvementScore: -15 })).key).toBe("trends.explanation.falling");
    expect(explainDirection(baseTrend({ direction: "falling", improvementScore: -40 })).key).toBe("trends.explanation.stronglyFalling");
    expect(explainDirection(baseTrend({ direction: "stable", improvementScore: 0 })).key).toBe("trends.explanation.stable");
  });

  it("rounds win rates to whole percentages", () => {
    const trend = baseTrend({ direction: "rising", improvementScore: 20, recentWinRate: 0.666, previousWinRate: 0.333 });
    expect(explainDirection(trend).params).toEqual({ previous: 33, recent: 67, matches: 10 });
  });
});

describe("explainMomentum", () => {
  it("counts wins directly from currentForm, not a separate field", () => {
    const trend = baseTrend({ currentForm: ["win", "win", "win", "loss", "draw"] });
    expect(explainMomentum(trend)).toEqual({ key: "trends.explanation.momentum", params: { wins: 3, matches: 5 } });
  });

  it("returns insufficientData when the direction is insufficientData", () => {
    expect(explainMomentum(baseTrend({ direction: "insufficientData", currentForm: [] })).key).toBe("trends.explanation.insufficientData");
  });
});

describe("explainConsistency", () => {
  it("bands consistencyScore into high/medium/low", () => {
    expect(explainConsistency(baseTrend({ consistencyScore: 90 })).key).toBe("trends.explanation.consistencyHigh");
    expect(explainConsistency(baseTrend({ consistencyScore: 50 })).key).toBe("trends.explanation.consistencyMedium");
    expect(explainConsistency(baseTrend({ consistencyScore: 10 })).key).toBe("trends.explanation.consistencyLow");
  });
});

describe("explainActivity", () => {
  it("bands activityScore into high/low", () => {
    expect(explainActivity(baseTrend({ activityScore: 80 })).key).toBe("trends.explanation.activityHigh");
    expect(explainActivity(baseTrend({ activityScore: 20 })).key).toBe("trends.explanation.activityLow");
  });
});

describe("explainAttack", () => {
  it("frames improved-or-steady scoring as a positive total ('Scored N goals in the last M matches')", () => {
    const trend = baseTrend({ recentGoalsPerMatch: 2.2, previousGoalsPerMatch: 1, currentForm: ["win", "win", "win", "loss", "loss"] });
    expect(explainAttack(trend)).toEqual({ key: "trends.explanation.attackStrong", params: { goals: 11, matches: 5 } });
  });

  it("frames declining scoring as 'fewer goals than the previous period'", () => {
    const trend = baseTrend({ recentGoalsPerMatch: 1, previousGoalsPerMatch: 2 });
    expect(explainAttack(trend)).toEqual({ key: "trends.explanation.attackWeak", params: {} });
  });
});

describe("explainDefence", () => {
  it("bands defenceScore into strong/weak", () => {
    expect(explainDefence(baseTrend({ defenceScore: 80 })).key).toBe("trends.explanation.defenceStrong");
    expect(explainDefence(baseTrend({ defenceScore: 20 })).key).toBe("trends.explanation.defenceWeak");
  });
});
