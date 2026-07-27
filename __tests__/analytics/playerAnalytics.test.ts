import {
  NOT_RANKED,
  calculateOpponentPerformance,
  calculatePlayerAnalytics,
  calculatePlayerClubUsage,
  calculatePlayerGoalDifferenceTimeline,
  calculatePlayerGoalsTimeline,
  calculatePlayerMatchesTimeline,
  calculatePlayerPerformanceTimeline,
  calculatePlayerRankTimeline,
  calculatePlayerRecentForm,
  calculatePlayerWinRateTimeline,
} from "../../src/lib/analytics/playerAnalytics";
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
const draw = (playerIds: string[], score: number): SideSpec => ({ playerIds, score, result: "draw" });

describe("calculatePlayerPerformanceTimeline", () => {
  const now = new Date(2026, 6, 27, 12);

  it("returns zero-filled buckets for an empty history without throwing", () => {
    expect(() => calculatePlayerPerformanceTimeline("a", [], "7d", now)).not.toThrow();
    const buckets = calculatePlayerPerformanceTimeline("a", [], "7d", now);
    expect(buckets).toHaveLength(7);
    expect(buckets.every((b) => b.matches === 0 && b.wins === 0 && b.goalsFor === 0)).toBe(true);
  });

  it("buckets matches by day and tallies wins/losses/draws and goals", () => {
    const today = makeMatch(win(["a"], 3), loss(["b"], 1), { playedAt: now.toISOString() });
    const yesterday = makeMatch(loss(["a"], 0), win(["b"], 2), { playedAt: new Date(now.getTime() - 86_400_000).toISOString() });
    const buckets = calculatePlayerPerformanceTimeline("a", [today, yesterday], "7d", now);

    const todayBucket = buckets[buckets.length - 1]!;
    const yesterdayBucket = buckets[buckets.length - 2]!;
    expect(todayBucket.wins).toBe(1);
    expect(todayBucket.goalsFor).toBe(3);
    expect(todayBucket.goalsAgainst).toBe(1);
    expect(yesterdayBucket.losses).toBe(1);
  });

  it("ignores matches the player wasn't part of", () => {
    const notMine = makeMatch(win(["x"], 3), loss(["y"], 1), { playedAt: now.toISOString() });
    const buckets = calculatePlayerPerformanceTimeline("a", [notMine], "7d", now);
    expect(buckets.every((b) => b.matches === 0)).toBe(true);
  });

  it("handles duplicate timestamps -- both matches land in the same bucket", () => {
    const sameInstant = now.toISOString();
    const m1 = makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: sameInstant });
    const m2 = makeMatch(win(["a"], 2), loss(["b"], 0), { playedAt: sameInstant });
    const buckets = calculatePlayerPerformanceTimeline("a", [m1, m2], "7d", now);
    expect(buckets[buckets.length - 1]!.matches).toBe(2);
  });

  it("drops matches with an invalid played_at instead of crashing", () => {
    const bad = makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: "not-a-date" });
    expect(() => calculatePlayerPerformanceTimeline("a", [bad], "7d", now)).not.toThrow();
    expect(calculatePlayerPerformanceTimeline("a", [bad], "7d", now).every((b) => b.matches === 0)).toBe(true);
  });

  it("silently excludes matches dated beyond the last bucket instead of crashing", () => {
    const farFuture = makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: new Date(now.getTime() + 30 * 86_400_000).toISOString() });
    expect(() => calculatePlayerPerformanceTimeline("a", [farFuture], "7d", now)).not.toThrow();
  });

  it("counts both singles and doubles matches", () => {
    const singles = makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: now.toISOString(), matchType: "singles" });
    const doubles = makeMatch(win(["a", "c"], 2), loss(["b", "d"], 1), { playedAt: now.toISOString(), matchType: "doubles" });
    const buckets = calculatePlayerPerformanceTimeline("a", [singles, doubles], "7d", now);
    expect(buckets[buckets.length - 1]!.matches).toBe(2);
  });
});

describe("derived player timelines", () => {
  const now = new Date(2026, 6, 27, 12);
  const matches = [
    makeMatch(win(["a"], 3), loss(["b"], 1), { playedAt: now.toISOString() }),
    makeMatch(loss(["a"], 0), win(["b"], 2), { playedAt: now.toISOString() }),
  ];

  it("calculatePlayerWinRateTimeline is wins/matches per bucket", () => {
    const points = calculatePlayerWinRateTimeline("a", matches, "7d", now);
    const last = points[points.length - 1]!;
    expect(last.value).toBeCloseTo(0.5);
    expect(last.matchesInBucket).toBe(2);
  });

  it("calculatePlayerGoalsTimeline sums goals for", () => {
    const last = calculatePlayerGoalsTimeline("a", matches, "7d", now).at(-1)!;
    expect(last.value).toBe(3);
  });

  it("calculatePlayerMatchesTimeline counts matches", () => {
    const last = calculatePlayerMatchesTimeline("a", matches, "7d", now).at(-1)!;
    expect(last.value).toBe(2);
  });

  it("calculatePlayerGoalDifferenceTimeline is goalsFor minus goalsAgainst", () => {
    const last = calculatePlayerGoalDifferenceTimeline("a", matches, "7d", now).at(-1)!;
    expect(last.value).toBe(3 - 1 + (0 - 2));
  });

  it("an empty history produces buckets with value 0, not a crash", () => {
    expect(calculatePlayerWinRateTimeline("a", [], "30d", now).every((p) => p.value === 0)).toBe(true);
  });
});

describe("calculatePlayerRankTimeline", () => {
  it("reports NOT_RANKED until the player qualifies for the win-rate leaderboard, then their live rank", () => {
    const now = new Date(2026, 6, 27, 12);
    const players = roster(["a", "b"]);
    // 4 wins for "a" -- one short of stats.ts's WIN_RATE_MIN_PLAYED (5).
    const matches: MatchSummary[] = Array.from({ length: 4 }, (_, i) =>
      makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: new Date(now.getTime() - (10 - i) * 86_400_000).toISOString() }),
    );
    // 5th win qualifies "a".
    matches.push(makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: now.toISOString() }));

    const timeline = calculatePlayerRankTimeline("a", players, matches, "1y", now);
    const lastPoint = timeline[timeline.length - 1]!;
    expect(lastPoint.value).toBe(1); // sole qualifier, ranked #1
    expect(lastPoint.value).not.toBe(NOT_RANKED);
  });

  it("returns NOT_RANKED for a player with no matches at all", () => {
    const now = new Date(2026, 6, 27, 12);
    const timeline = calculatePlayerRankTimeline("a", roster(["a", "b"]), [], "30d", now);
    expect(timeline.every((p) => p.value === NOT_RANKED)).toBe(true);
  });
});

describe("calculatePlayerRecentForm", () => {
  it("wraps stats.ts's computeLastNStats with the requested window size", () => {
    const matches = [makeMatch(win(["a"], 1), loss(["b"], 0)), makeMatch(loss(["a"], 0), win(["b"], 1))];
    const result = calculatePlayerRecentForm("a", matches, 10);
    expect(result.windowSize).toBe(10);
    expect(result.form).toHaveLength(2);
    expect(result.stats.played).toBe(2);
  });

  it("handles fewer matches than the window size", () => {
    const result = calculatePlayerRecentForm("a", [makeMatch(win(["a"], 1), loss(["b"], 0))], 10);
    expect(result.stats.played).toBe(1);
  });

  it("handles a player with zero matches", () => {
    const result = calculatePlayerRecentForm("a", [], 10);
    expect(result.form).toEqual([]);
    expect(result.stats.played).toBe(0);
  });
});

describe("calculateOpponentPerformance", () => {
  it("lists only opponents actually shared with at least one match, most-played first", () => {
    const matches = [
      makeMatch(win(["a"], 1), loss(["b"], 0)),
      makeMatch(win(["a"], 1), loss(["b"], 0)),
      makeMatch(win(["a"], 1), loss(["c"], 0)),
    ];
    const result = calculateOpponentPerformance("a", roster(["a", "b", "c", "d"]), matches);
    expect(result.map((r) => r.opponentId)).toEqual(["b", "c"]);
    expect(result[0]!.played).toBe(2);
    expect(result[0]!.winRate).toBe(1);
  });

  it("returns an empty list when the player has never played anyone", () => {
    expect(calculateOpponentPerformance("a", roster(["a", "b"]), [])).toEqual([]);
  });

  it("doesn't include opponents absent from the passed roster, even if they appear in match history (e.g. archived/deleted players filtered out by the caller)", () => {
    const matches = [makeMatch(win(["a"], 1), loss(["ghost"], 0))];
    const result = calculateOpponentPerformance("a", roster(["a", "b"]), matches);
    expect(result).toEqual([]);
  });
});

describe("calculatePlayerClubUsage", () => {
  it("computes each club's share of the player's matches, summing to 1", () => {
    const matches = [
      makeMatch({ playerIds: ["a"], score: 1, result: "win", clubId: "barca", clubName: "Barcelona" }, loss(["b"], 0)),
      makeMatch({ playerIds: ["a"], score: 2, result: "win", clubId: "barca", clubName: "Barcelona" }, loss(["b"], 1)),
      makeMatch({ playerIds: ["a"], score: 0, result: "loss", clubId: "real", clubName: "Real Madrid" }, win(["b"], 1)),
    ];

    const usage = calculatePlayerClubUsage("a", matches);
    const totalShare = usage.reduce((sum, u) => sum + u.share, 0);
    expect(totalShare).toBeCloseTo(1);
    expect(usage.find((u) => u.clubId === "barca")?.matchesPlayed).toBe(2);
  });

  it("returns an empty list for a player with no matches", () => {
    expect(calculatePlayerClubUsage("a", [])).toEqual([]);
  });

  it("sums goals for/against per club from the player's own side only", () => {
    const matches = [
      makeMatch({ playerIds: ["a"], score: 3, result: "win", clubId: "barca", clubName: "Barcelona" }, loss(["b"], 1)),
      makeMatch({ playerIds: ["a"], score: 2, result: "win", clubId: "barca", clubName: "Barcelona" }, loss(["b"], 0)),
      makeMatch({ playerIds: ["a"], score: 0, result: "loss", clubId: "real", clubName: "Real Madrid" }, win(["b"], 1)),
    ];
    const usage = calculatePlayerClubUsage("a", matches);
    expect(usage.find((u) => u.clubId === "barca")).toMatchObject({ goalsFor: 5, goalsAgainst: 1 });
    expect(usage.find((u) => u.clubId === "real")).toMatchObject({ goalsFor: 0, goalsAgainst: 1 });
  });
});

describe("calculatePlayerAnalytics", () => {
  const now = new Date(2026, 6, 27, 12);

  it("does not throw and returns a fully zeroed summary for an empty history", () => {
    expect(() => calculatePlayerAnalytics("a", roster(["a", "b"]), [], "all", now)).not.toThrow();
    const summary = calculatePlayerAnalytics("a", roster(["a", "b"]), [], "all", now);
    expect(summary.matchesConsidered).toBe(0);
    expect(summary.overall.played).toBe(0);
    expect(summary.opponents).toEqual([]);
    expect(summary.clubUsage).toEqual([]);
    expect(summary.winRateTimeline.length).toBeGreaterThan(0);
  });

  it("splits singles and doubles correctly in a mixed history", () => {
    const matches = [
      makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: now.toISOString(), matchType: "singles" }),
      makeMatch(win(["a", "c"], 2), loss(["b", "d"], 1), { playedAt: now.toISOString(), matchType: "doubles" }),
    ];
    const summary = calculatePlayerAnalytics("a", roster(["a", "b", "c", "d"]), matches, "all", now);
    expect(summary.singles.played).toBe(1);
    expect(summary.doubles.played).toBe(1);
    expect(summary.matchesConsidered).toBe(2);
  });

  it("recentForm reflects the player's true most recent matches regardless of the selected range", () => {
    const old = makeMatch(win(["a"], 1), loss(["b"], 0), { playedAt: new Date(now.getTime() - 400 * 86_400_000).toISOString() });
    const summary = calculatePlayerAnalytics("a", roster(["a", "b"]), [old], "7d", now);
    expect(summary.recentForm.stats.played).toBe(1);
    expect(summary.overall.played).toBe(0); // outside the 7d window
  });

  it("exposes performanceTimeline consistent with the derived winRate/goals/matches/goalDifference timelines", () => {
    const matches = [
      makeMatch(win(["a"], 3), loss(["b"], 1), { playedAt: now.toISOString() }),
      makeMatch(loss(["a"], 0), win(["b"], 2), { playedAt: now.toISOString() }),
    ];
    const summary = calculatePlayerAnalytics("a", roster(["a", "b"]), matches, "7d", now);
    const lastBucket = summary.performanceTimeline.at(-1)!;
    expect(lastBucket).toMatchObject({ matches: 2, wins: 1, losses: 1, draws: 0, goalsFor: 3, goalsAgainst: 3 });

    expect(summary.winRateTimeline.at(-1)!.value).toBeCloseTo(lastBucket.wins / lastBucket.matches);
    expect(summary.goalsTimeline.at(-1)!.value).toBe(lastBucket.goalsFor);
    expect(summary.matchesTimeline.at(-1)!.value).toBe(lastBucket.matches);
    expect(summary.goalDifferenceTimeline.at(-1)!.value).toBe(lastBucket.goalsFor - lastBucket.goalsAgainst);
  });
});
