import {
  computeAllRecordsFromRows,
  computeBestDoublesPairs,
  computeBiggestLoss,
  computeBiggestWin,
  computeCleanSheetsLeaderboard,
  computeClubPerformance,
  computeConsistency,
  computeDayOfWeekPerformance,
  computeDoublesPartnerships,
  computeFavoriteOpponent,
  computeFewestConcededLeaderboard,
  computeFormTrend,
  computeGoalDifferenceLeaderboard,
  computeGoalsScoredLeaderboard,
  computeGoalStats,
  computeHeadToHead,
  computeLastNStats,
  computeLongestLossStreakLeaderboard,
  computeLongestStreakLeaderboard,
  computeMatchTypeSplit,
  computeMonthlyLeaderboard,
  computeMostBalancedRivalry,
  computeMostMatchesLeaderboard,
  computeNemesis,
  computeNotYetQualified,
  computeOldestRivalry,
  computePerformanceAfterBreak,
  computePlayerMonthlyTrend,
  computePlayerStats,
  computeRecordFromRows,
  computeRivalries,
  computeSpecialConditionsPerformance,
  computeStreaks,
  computeWinRateLeaderboard,
  computeWinRateProgression,
  computeWinRateRank,
  findSides,
} from "../src/lib/stats";
import type { MatchSidePlayer, MatchSummary, PlayerRecordRow } from "../src/lib/matches";

function makeMatch(playerIdsBySide: [string[], string[]], results: ["win" | "loss" | "draw", "win" | "loss" | "draw"]): MatchSummary {
  return {
    id: `match-${Math.random()}`,
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: new Date().toISOString(),
    sides: [
      {
        id: "side-1",
        side_number: 1,
        score: 0,
        penalty_score: null,
        result: results[0],
        club: null,
        players: playerIdsBySide[0].map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" })),
      },
      {
        id: "side-2",
        side_number: 2,
        score: 0,
        penalty_score: null,
        result: results[1],
        club: null,
        players: playerIdsBySide[1].map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" })),
      },
    ],
  };
}

describe("computePlayerStats", () => {
  it("returns zeroed stats and a null win rate for a player with no matches", () => {
    expect(computePlayerStats("p1", [])).toEqual({ played: 0, wins: 0, losses: 0, draws: 0, winRate: null });
  });

  it("counts wins, losses, and draws across multiple matches", () => {
    const matches = [
      makeMatch([["p1"], ["p2"]], ["win", "loss"]),
      makeMatch([["p1"], ["p2"]], ["loss", "win"]),
      makeMatch([["p1"], ["p2"]], ["draw", "draw"]),
    ];
    expect(computePlayerStats("p1", matches)).toEqual({ played: 3, wins: 1, losses: 1, draws: 1, winRate: 1 / 3 });
  });

  it("ignores matches the player wasn't part of", () => {
    const matches = [makeMatch([["other1"], ["other2"]], ["win", "loss"])];
    expect(computePlayerStats("p1", matches).played).toBe(0);
  });
});

describe("computeRecordFromRows / computeAllRecordsFromRows", () => {
  // Regression coverage for the bug where Home/Player-detail computed
  // records from a recency-capped match list (20 or 100 most recent group
  // matches) instead of the player's full history -- these operate on
  // fetchPlayerRecordRows' uncapped rows instead.
  const rows: PlayerRecordRow[] = [
    { player_id: "p1", result: "win" },
    { player_id: "p1", result: "win" },
    { player_id: "p1", result: "loss" },
    { player_id: "p2", result: "draw" },
  ];

  it("computes a record from every row for that player, with no cap", () => {
    expect(computeRecordFromRows("p1", rows)).toEqual({ played: 3, wins: 2, losses: 1, draws: 0, winRate: 2 / 3 });
  });

  it("returns zeroed stats for a player with no rows", () => {
    expect(computeRecordFromRows("p3", rows)).toEqual({ played: 0, wins: 0, losses: 0, draws: 0, winRate: null });
  });

  it("computes independent records for every requested player id in one pass", () => {
    const all = computeAllRecordsFromRows(["p1", "p2", "p3"], rows);
    expect(all.get("p1")).toEqual({ played: 3, wins: 2, losses: 1, draws: 0, winRate: 2 / 3 });
    expect(all.get("p2")).toEqual({ played: 1, wins: 0, losses: 0, draws: 1, winRate: 0 });
    expect(all.get("p3")).toEqual({ played: 0, wins: 0, losses: 0, draws: 0, winRate: null });
  });
});

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
  club?: { id: string; name: string } | null;
}

function makeDetailedMatch(
  side1: SideSpec,
  side2: SideSpec,
  opts?: { matchType?: "singles" | "doubles"; playedAt?: string; isOvertime?: boolean; isPenalties?: boolean },
): MatchSummary {
  const toSide = (spec: SideSpec, sideNumber: 1 | 2) => ({
    id: `side-${sideNumber}-${Math.random()}`,
    side_number: sideNumber,
    score: spec.score,
    penalty_score: null,
    result: spec.result,
    club: spec.club ?? null,
    players: spec.playerIds.map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" })),
  });

  return {
    id: `match-${Math.random()}`,
    match_type: opts?.matchType ?? "singles",
    is_overtime: opts?.isOvertime ?? false,
    is_penalties: opts?.isPenalties ?? false,
    notes: null,
    played_at: opts?.playedAt ?? new Date().toISOString(),
    sides: [toSide(side1, 1), toSide(side2, 2)],
  };
}

describe("findSides", () => {
  it("identifies own side and opponent side regardless of which side the player is on", () => {
    const match = makeDetailedMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" });
    expect(findSides("p1", match)).toEqual({ own: match.sides[0], opponent: match.sides[1] });
    expect(findSides("p2", match)).toEqual({ own: match.sides[1], opponent: match.sides[0] });
  });

  it("returns null for a player not in the match", () => {
    const match = makeDetailedMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" });
    expect(findSides("p3", match)).toBeNull();
  });
});

describe("computeGoalStats", () => {
  it("returns zeroed stats with a null per-match average for no matches", () => {
    expect(computeGoalStats("p1", [])).toEqual({ goalsScored: 0, goalsConceded: 0, goalsPerMatch: null, cleanSheets: 0 });
  });

  it("sums goals scored/conceded, computes the per-match average, and counts clean sheets", () => {
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "loss" }, { playerIds: ["p2"], score: 2, result: "win" }),
    ];
    expect(computeGoalStats("p1", matches)).toEqual({ goalsScored: 4, goalsConceded: 2, goalsPerMatch: 2, cleanSheets: 1 });
  });
});

describe("computeStreaks", () => {
  it("returns a null current streak and zeroed longest streaks for no matches", () => {
    expect(computeStreaks("p1", [])).toEqual({ currentStreak: { result: null, count: 0 }, longestWinStreak: 0, longestLossStreak: 0 });
  });

  it("computes the current trailing streak and longest streaks, independent of input order", () => {
    const base = Date.now();
    const day = (n: number) => new Date(base + n * 86_400_000).toISOString();
    // Chronological: win, win, win, loss, win, win -- current streak is 2 wins, longest win streak is 3.
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: day(5) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: day(0) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p2"], score: 1, result: "win" }, { playedAt: day(3) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: day(1) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: day(4) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: day(2) }),
    ];
    expect(computeStreaks("p1", matches)).toEqual({ currentStreak: { result: "win", count: 2 }, longestWinStreak: 3, longestLossStreak: 1 });
  });
});

describe("computeLastNStats", () => {
  it("only considers the N most recent matches the player was part of, most recent first", () => {
    const base = Date.now();
    const day = (n: number) => new Date(base + n * 86_400_000).toISOString();
    const matches = [0, 1, 2].map((n) =>
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: day(n) }),
    );
    matches.push(makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p2"], score: 1, result: "win" }, { playedAt: day(-1) }));

    const { stats, form } = computeLastNStats("p1", matches, 2);
    expect(stats).toEqual({ played: 2, wins: 2, losses: 0, draws: 0, winRate: 1 });
    expect(form.map((f) => f.result)).toEqual(["win", "win"]);
    expect(form[0]!.playedAt).toBe(day(2));
  });
});

describe("computeBiggestWin / computeBiggestLoss", () => {
  it("returns null when the player has no wins or no losses", () => {
    const matches = [makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" })];
    expect(computeBiggestLoss("p1", matches)).toBeNull();
    expect(computeBiggestWin("p2", matches)).toBeNull();
  });

  it("picks the win/loss with the largest score margin", () => {
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 5, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p2"], score: 1, result: "win" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p2"], score: 4, result: "win" }),
    ];
    expect(computeBiggestWin("p1", matches)?.margin).toBe(5);
    expect(computeBiggestLoss("p1", matches)?.margin).toBe(4);
  });
});

describe("computeHeadToHead", () => {
  const base = Date.now();
  const day = (n: number) => new Date(base + n * 86_400_000).toISOString();

  it("only counts matches played directly against the given opponent, with averages, best/worst result, and current streak", () => {
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: day(0) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p3"], score: 1, result: "win" }, { playedAt: day(1) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }, { playedAt: day(2) }),
    ];
    const vsP2 = computeHeadToHead("p1", "p2", matches);
    expect(vsP2).toMatchObject({
      played: 2,
      wins: 2,
      losses: 0,
      draws: 0,
      winRate: 1,
      goalsFor: 3,
      goalsAgainst: 1,
      goalDifference: 2,
      averageScoreFor: 1.5,
      averageScoreAgainst: 0.5,
    });
    expect(vsP2.largestVictory).toMatchObject({ ownScore: 1, opponentScore: 0, margin: 1 });
    expect(vsP2.largestDefeat).toBeNull();
    expect(vsP2.currentStreak).toEqual({ result: "win", count: 2 });

    const vsP3 = computeHeadToHead("p1", "p3", matches);
    expect(vsP3).toMatchObject({
      played: 1,
      wins: 0,
      losses: 1,
      draws: 0,
      winRate: 0,
      goalsFor: 0,
      goalsAgainst: 1,
      goalDifference: -1,
      averageScoreFor: 0,
      averageScoreAgainst: 1,
    });
    expect(vsP3.largestVictory).toBeNull();
    expect(vsP3.largestDefeat).toMatchObject({ ownScore: 0, opponentScore: 1, margin: 1 });
    expect(vsP3.currentStreak).toEqual({ result: "loss", count: 1 });
  });

  it("returns null averages/streak and zeroed stats for two players who've never played each other", () => {
    const h2h = computeHeadToHead("p1", "p2", []);
    expect(h2h).toMatchObject({ played: 0, averageScoreFor: null, averageScoreAgainst: null });
    expect(h2h.currentStreak).toEqual({ result: null, count: 0 });
  });
});

describe("computeFavoriteOpponent / computeNemesis", () => {
  const base = Date.now();
  const day = (n: number) => new Date(base + n * 86_400_000).toISOString();

  it("finds the most-played opponent and the opponent with the lowest qualified win rate", () => {
    const matches = [
      // p1 plays p2 three times, losing every time (nemesis candidate).
      ...[0, 1, 2].map((n) => makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p2"], score: 1, result: "win" }, { playedAt: day(n) })),
      // p1 plays p3 once, winning (too few matches to qualify as nemesis, but still the favorite-opponent tiebreak candidate if most played).
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p3"], score: 0, result: "loss" }, { playedAt: day(3) }),
    ];
    const roster = [
      { id: "p1", display_name: "p1", avatar_url: null, custom_color: "#000" },
      { id: "p2", display_name: "p2", avatar_url: null, custom_color: "#000" },
      { id: "p3", display_name: "p3", avatar_url: null, custom_color: "#000" },
    ];
    expect(computeFavoriteOpponent("p1", roster, matches)?.opponentId).toBe("p2");
    expect(computeNemesis("p1", roster, matches, 3)?.opponentId).toBe("p2");
    // p3 is excluded from nemesis consideration -- only 1 match, below the minPlayed of 3.
    expect(computeNemesis("p1", roster, matches, 3)?.opponentId).not.toBe("p3");
  });

  it("returns null when there are no qualifying opponents", () => {
    const roster = [{ id: "p1", display_name: "p1", avatar_url: null, custom_color: "#000" }];
    expect(computeFavoriteOpponent("p1", roster, [])).toBeNull();
    expect(computeNemesis("p1", roster, [])).toBeNull();
  });
});

describe("computeRivalries / computeMostBalancedRivalry / computeOldestRivalry", () => {
  const base = Date.now();
  const day = (n: number) => new Date(base + n * 86_400_000).toISOString();
  const roster = [
    { id: "p1", display_name: "p1", avatar_url: null, custom_color: "#000" },
    { id: "p2", display_name: "p2", avatar_url: null, custom_color: "#000" },
    { id: "p3", display_name: "p3", avatar_url: null, custom_color: "#000" },
  ];

  it("only includes pairs who've played at least minPlayed times, and picks the most balanced and oldest", () => {
    const matches = [
      // p1 vs p2: perfectly balanced (1-1), starting earlier.
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: day(0) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p2"], score: 1, result: "win" }, { playedAt: day(1) }),
      // p1 vs p3: lopsided (2-0), starting later.
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p3"], score: 0, result: "loss" }, { playedAt: day(5) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p3"], score: 0, result: "loss" }, { playedAt: day(6) }),
    ];
    const rivalries = computeRivalries(roster, matches, 2);
    expect(rivalries).toHaveLength(2);
    expect(computeMostBalancedRivalry(roster, matches, 2)?.playerIds).toEqual(["p1", "p2"]);
    expect(computeOldestRivalry(roster, matches, 2)?.playerIds).toEqual(["p1", "p2"]);
  });

  it("returns null when no pair meets the threshold", () => {
    const matches = [makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" })];
    expect(computeMostBalancedRivalry(roster, matches, 2)).toBeNull();
    expect(computeOldestRivalry(roster, matches, 2)).toBeNull();
  });
});

describe("computeClubPerformance", () => {
  it("aggregates a player's record by the club they played as, ignoring matches with no club, sorted by most played", () => {
    const barca = { id: "c1", name: "Barcelona" };
    const madrid = { id: "c2", name: "Real Madrid" };
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win", club: barca }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss", club: barca }, { playerIds: ["p2"], score: 1, result: "win" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 2, result: "win", club: madrid }, { playerIds: ["p2"], score: 1, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "draw", club: null }, { playerIds: ["p2"], score: 0, result: "draw" }),
    ];
    const rows = computeClubPerformance("p1", matches);
    expect(rows).toEqual([
      { clubId: "c1", clubName: "Barcelona", played: 2, wins: 1, losses: 1, draws: 0, winRate: 0.5 },
      { clubId: "c2", clubName: "Real Madrid", played: 1, wins: 1, losses: 0, draws: 0, winRate: 1 },
    ]);
  });
});

describe("computeDoublesPartnerships", () => {
  it("only counts doubles matches, groups by teammate excluding the player themselves", () => {
    const matches = [
      makeDetailedMatch(
        { playerIds: ["p1", "mate1"], score: 3, result: "win" },
        { playerIds: ["p2", "p3"], score: 1, result: "loss" },
        { matchType: "doubles" },
      ),
      makeDetailedMatch(
        { playerIds: ["p1", "mate1"], score: 0, result: "loss" },
        { playerIds: ["p2", "p3"], score: 2, result: "win" },
        { matchType: "doubles" },
      ),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { matchType: "singles" }),
    ];
    expect(computeDoublesPartnerships("p1", matches)).toEqual([
      { teammateId: "mate1", teammateName: "mate1", played: 2, wins: 1, losses: 1, draws: 0, winRate: 0.5 },
    ]);
  });
});

function roster(ids: string[]): MatchSidePlayer[] {
  return ids.map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" }));
}

describe("computeWinRateLeaderboard", () => {
  it("excludes players below the minPlayed threshold and sorts by win rate", () => {
    const matches = [
      // p1 beats p2 three times (100% for p1, 0% for p2, both with 3 played).
      ...[0, 1, 2].map(() => makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" })),
      // p4 has a single win -- below the minPlayed threshold of 3, so excluded.
      makeDetailedMatch({ playerIds: ["p4"], score: 1, result: "win" }, { playerIds: ["p3"], score: 0, result: "loss" }),
    ];
    const rows = computeWinRateLeaderboard(roster(["p1", "p2", "p3", "p4"]), matches, 3);
    expect(rows.map((r) => r.playerId)).toEqual(["p1", "p2"]);
    expect(rows[0]).toMatchObject({ value: 1, valueLabel: "100%", detail: "3W-0L-0D" });
    expect(rows[1]).toMatchObject({ value: 0, valueLabel: "0%", detail: "0W-3L-0D" });
  });

  it("defaults to a 5-match qualification threshold", () => {
    const matches = [0, 1, 2, 3].map(() =>
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
    );
    expect(computeWinRateLeaderboard(roster(["p1", "p2"]), matches)).toEqual([]);
  });

  it("breaks win-rate ties by wins, then goal difference, then goals scored, then matches played", () => {
    // p1 and p2 both go 3-2 (60% win rate) across 5 matches -- tie broken by the chain below.
    const matches = [
      // p1: 3 wins (2-0, 3-0, 1-0 -- goals for 6, against 0), 2 losses (0-1, 0-1 -- against 2 more) => GD +4, GF 6.
      makeDetailedMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }),
      // p2: same win/loss record (3-2) but smaller goal difference (+1) -- should rank below p1.
      makeDetailedMatch({ playerIds: ["p2"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p2"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p2"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p2"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }),
      makeDetailedMatch({ playerIds: ["p2"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }),
    ];
    const rows = computeWinRateLeaderboard(roster(["p1", "p2"]), matches, 5);
    expect(rows.map((r) => r.playerId)).toEqual(["p1", "p2"]);
  });
});

describe("computeNotYetQualified", () => {
  it("lists players below the threshold, sorted by matches played descending", () => {
    const matches = [
      ...[0, 1, 2].map(() => makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" })),
      makeDetailedMatch({ playerIds: ["p2"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }),
    ];
    const rows = computeNotYetQualified(roster(["p1", "p2", "p3"]), matches);
    expect(rows).toEqual([
      { playerId: "p1", playerName: "p1", avatarUrl: null, color: "#000", played: 3, matchesRemaining: 2 },
      { playerId: "p2", playerName: "p2", avatarUrl: null, color: "#000", played: 1, matchesRemaining: 4 },
      { playerId: "p3", playerName: "p3", avatarUrl: null, color: "#000", played: 0, matchesRemaining: 5 },
    ]);
  });

  it("excludes players who've already qualified", () => {
    const matches = [0, 1, 2, 3, 4].map(() =>
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }),
    );
    expect(computeNotYetQualified(roster(["p1"]), matches)).toEqual([]);
  });
});

describe("computeWinRateRank", () => {
  it("ranks a qualified player among other qualified players", () => {
    const matches = [
      ...[0, 1, 2, 3, 4].map(() => makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" })),
      ...[0, 1, 2, 3, 4].map(() => makeDetailedMatch({ playerIds: ["p2"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" })),
    ];
    expect(computeWinRateRank("p1", roster(["p1", "p2"]), matches)).toEqual({ position: 1, of: 2 });
  });

  it("returns null for a player who hasn't qualified yet", () => {
    const matches = [makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" })];
    expect(computeWinRateRank("p1", roster(["p1"]), matches)).toBeNull();
  });
});

describe("computeWinRateProgression", () => {
  it("returns the cumulative win rate (as a whole percent) after each match, oldest first", () => {
    const base = Date.now();
    const day = (n: number) => new Date(base + n * 86_400_000).toISOString();
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(1) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, { playedAt: day(0) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(2) }),
    ];
    // Oldest first: loss (0%), win (50%), win (67%).
    expect(computeWinRateProgression("p1", matches)).toEqual([0, 50, 67]);
  });

  it("returns an empty series for a player with no matches", () => {
    expect(computeWinRateProgression("p1", [])).toEqual([]);
  });
});

describe("computeMostMatchesLeaderboard", () => {
  it("sorts by matches played descending and excludes players with none", () => {
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p2"], score: 1, result: "win" }),
    ];
    const rows = computeMostMatchesLeaderboard(roster(["p1", "p2", "p3"]), matches);
    expect(rows.map((r) => r.playerId)).toEqual(["p1", "p2"]);
    expect(rows[0]!.value).toBe(2);
  });
});

describe("computeLongestStreakLeaderboard", () => {
  it("ranks by longest win streak, excluding players with no wins", () => {
    const base = Date.now();
    const day = (n: number) => new Date(base + n * 86_400_000).toISOString();
    const matches = [
      // p1 beats p2 twice (win streak of 2).
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: day(0) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: day(1) }),
      // p2 then beats p3 once (win streak of 1). p3 has no wins at all, so it's excluded.
      makeDetailedMatch({ playerIds: ["p3"], score: 0, result: "loss" }, { playerIds: ["p2"], score: 1, result: "win" }, { playedAt: day(2) }),
    ];
    const rows = computeLongestStreakLeaderboard(roster(["p1", "p2", "p3"]), matches);
    expect(rows.map((r) => r.playerId)).toEqual(["p1", "p2"]);
    expect(rows[0]).toMatchObject({ value: 2, valueLabel: "2" });
    expect(rows[1]).toMatchObject({ value: 1, valueLabel: "1" });
  });
});

describe("computeGoalsScoredLeaderboard", () => {
  it("sorts by total goals scored descending", () => {
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 5, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "loss" }, { playerIds: ["p2"], score: 2, result: "win" }),
    ];
    const rows = computeGoalsScoredLeaderboard(roster(["p1", "p2"]), matches);
    expect(rows.map((r) => r.playerId)).toEqual(["p1", "p2"]);
    expect(rows[0]).toMatchObject({ value: 6, valueLabel: "6", detail: "3.00 per match" });
  });
});

describe("computeFewestConcededLeaderboard", () => {
  it("sorts ascending by goals conceded, excluding players below minPlayed", () => {
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 4, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }),
    ];
    // p1 concedes 1+0+1=2 across 3 matches; p2 concedes 3+2+4=9.
    const rows = computeFewestConcededLeaderboard(roster(["p1", "p2"]), matches, 3);
    expect(rows.map((r) => r.playerId)).toEqual(["p1", "p2"]);
    expect(rows[0]!.value).toBe(2);
    expect(rows[1]!.value).toBe(9);
  });
});

describe("computeMonthlyLeaderboard", () => {
  it("only counts matches played in the given month/year, ranked by wins", () => {
    const inMonth = new Date(2026, 2, 15).toISOString();
    const outOfMonth = new Date(2026, 1, 15).toISOString();
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: inMonth }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: outOfMonth }),
    ];
    const rows = computeMonthlyLeaderboard(roster(["p1", "p2"]), matches, 2026, 2);
    expect(rows.map((r) => r.playerId)).toEqual(["p1", "p2"]);
    expect(rows[0]).toMatchObject({ value: 1, valueLabel: "1 win" });
    expect(rows[1]).toMatchObject({ value: 0, valueLabel: "0 wins" });
  });
});

describe("computeBestDoublesPairs", () => {
  it("aggregates each side's pair across doubles matches, ignoring singles, sorted by win rate then played", () => {
    const matches = [
      ...[0, 1, 2].map(() =>
        makeDetailedMatch(
          { playerIds: ["p1", "p2"], score: 2, result: "win" },
          { playerIds: ["p3", "p4"], score: 1, result: "loss" },
          { matchType: "doubles" },
        ),
      ),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p3"], score: 0, result: "loss" }, { matchType: "singles" }),
    ];
    const rows = computeBestDoublesPairs(matches, 3);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ playerIds: ["p1", "p2"], played: 3, wins: 3, losses: 0, winRate: 1 });
    expect(rows[1]).toMatchObject({ playerIds: ["p3", "p4"], played: 3, wins: 0, losses: 3, winRate: 0 });
  });

  it("excludes pairs below the minPlayed threshold", () => {
    const matches = [
      makeDetailedMatch(
        { playerIds: ["p1", "p2"], score: 2, result: "win" },
        { playerIds: ["p3", "p4"], score: 1, result: "loss" },
        { matchType: "doubles" },
      ),
    ];
    expect(computeBestDoublesPairs(matches, 3)).toEqual([]);
  });
});

describe("computeLongestLossStreakLeaderboard", () => {
  it("ranks by longest losing streak, excluding players with no losses", () => {
    const base = Date.now();
    const day = (n: number) => new Date(base + n * 86_400_000).toISOString();
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p2"], score: 1, result: "win" }, { playedAt: day(0) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p2"], score: 1, result: "win" }, { playedAt: day(1) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p3"], score: 1, result: "win" }, { playedAt: day(2) }),
    ];
    const rows = computeLongestLossStreakLeaderboard(roster(["p1", "p2", "p3"]), matches);
    expect(rows.map((r) => r.playerId)).toEqual(["p1"]);
    expect(rows[0]).toMatchObject({ value: 3, valueLabel: "3" });
  });
});

describe("computeGoalDifferenceLeaderboard", () => {
  it("ranks by goals-for minus goals-against, including negative differences", () => {
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "loss" }, { playerIds: ["p2"], score: 2, result: "win" }),
    ];
    // p1: scored 4, conceded 3 -> +1. p2: scored 3, conceded 4 -> -1.
    const rows = computeGoalDifferenceLeaderboard(roster(["p1", "p2"]), matches);
    expect(rows.map((r) => r.playerId)).toEqual(["p1", "p2"]);
    expect(rows[0]).toMatchObject({ value: 1, valueLabel: "+1" });
    expect(rows[1]).toMatchObject({ value: -1, valueLabel: "-1" });
  });
});

describe("computeCleanSheetsLeaderboard", () => {
  it("ranks by clean sheet count, excluding players with none", () => {
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p2"], score: 1, result: "win" }, { playerIds: ["p1"], score: 1, result: "loss" }),
    ];
    const rows = computeCleanSheetsLeaderboard(roster(["p1", "p2"]), matches);
    expect(rows.map((r) => r.playerId)).toEqual(["p1"]);
    expect(rows[0]).toMatchObject({ value: 2, valueLabel: "2", detail: "in 3 matches" });
  });
});

describe("computeMatchTypeSplit", () => {
  it("separates a player's record into singles and doubles", () => {
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { matchType: "singles" }),
      makeDetailedMatch(
        { playerIds: ["p1", "mate"], score: 0, result: "loss" },
        { playerIds: ["x", "y"], score: 1, result: "win" },
        { matchType: "doubles" },
      ),
    ];
    const split = computeMatchTypeSplit("p1", matches);
    expect(split.singles).toEqual({ played: 1, wins: 1, losses: 0, draws: 0, winRate: 1 });
    expect(split.doubles).toEqual({ played: 1, wins: 0, losses: 1, draws: 0, winRate: 0 });
  });
});

describe("computeSpecialConditionsPerformance", () => {
  it("isolates matches that went to overtime or penalties", () => {
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 1, result: "loss" }, { isOvertime: true }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, { isPenalties: true }),
    ];
    const perf = computeSpecialConditionsPerformance("p1", matches);
    expect(perf.overtime).toEqual({ played: 1, wins: 1, losses: 0, draws: 0, winRate: 1 });
    expect(perf.penalties).toEqual({ played: 1, wins: 0, losses: 1, draws: 0, winRate: 0 });
  });
});

describe("computeDayOfWeekPerformance", () => {
  it("returns all 7 days, grouping matches by the local day they were played", () => {
    // 2026-03-02 is a Monday (day 1); 2026-03-08 is a Sunday (day 0).
    const monday = new Date(2026, 2, 2, 12).toISOString();
    const sunday = new Date(2026, 2, 8, 12).toISOString();
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: monday }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: monday }),
    ];
    const rows = computeDayOfWeekPerformance("p1", matches);
    expect(rows).toHaveLength(7);
    const mondayRow = rows.find((r) => r.day === new Date(monday).getDay())!;
    expect(mondayRow.stats.played).toBe(2);
    const sundayRow = rows.find((r) => r.day === new Date(sunday).getDay())!;
    expect(sundayRow.stats.played).toBe(0);
  });
});

describe("computePerformanceAfterBreak", () => {
  it("only counts matches preceded by a gap of at least breakDays since the player's previous match", () => {
    const base = Date.now();
    const day = (n: number) => new Date(base + n * 86_400_000).toISOString();
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(0) }),
      // 1-day gap -- not a break.
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, { playedAt: day(1) }),
      // 10-day gap -- counts as a break.
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(11) }),
    ];
    expect(computePerformanceAfterBreak("p1", matches, 7)).toEqual({ played: 1, wins: 1, losses: 0, draws: 0, winRate: 1 });
  });

  it("never counts the player's first-ever match as after a break", () => {
    const matches = [makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" })];
    expect(computePerformanceAfterBreak("p1", matches, 7).played).toBe(0);
  });
});

describe("computeConsistency", () => {
  it("returns null below MIN_SAMPLE_SIZE matches", () => {
    const matches = [makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" })];
    expect(computeConsistency("p1", matches)).toEqual({ goalMarginStdDev: null, matchesConsidered: 1 });
  });

  it("computes the standard deviation of goal margin across matches", () => {
    // Margins: +1, +1, +1 -- zero variance, perfectly consistent.
    const matches = [0, 1, 2].map(() =>
      makeDetailedMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["x"], score: 1, result: "loss" }),
    );
    expect(computeConsistency("p1", matches)).toEqual({ goalMarginStdDev: 0, matchesConsidered: 3 });
  });
});

describe("computeFormTrend", () => {
  it("returns null when there isn't enough history for two full windows", () => {
    const matches = [makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" })];
    expect(computeFormTrend("p1", matches, 5)).toEqual({ trend: null, recentWinRate: null, previousWinRate: null });
  });

  it("detects an improving trend when the recent window's win rate is higher", () => {
    const base = Date.now();
    const day = (n: number) => new Date(base + n * 86_400_000).toISOString();
    const matches = [
      // Older window (days 0-1): both losses.
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, { playedAt: day(0) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["x"], score: 1, result: "win" }, { playedAt: day(1) }),
      // Recent window (days 2-3): both wins.
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(2) }),
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, { playedAt: day(3) }),
    ];
    expect(computeFormTrend("p1", matches, 2)).toEqual({ trend: "improving", recentWinRate: 1, previousWinRate: 0 });
  });
});

describe("computePlayerMonthlyTrend", () => {
  it("groups a player's matches by calendar month, chronological, skipping months with no matches", () => {
    const matches = [
      makeDetailedMatch(
        { playerIds: ["p1"], score: 1, result: "win" },
        { playerIds: ["x"], score: 0, result: "loss" },
        { playedAt: new Date(2026, 1, 10).toISOString() },
      ),
      makeDetailedMatch(
        { playerIds: ["p1"], score: 0, result: "loss" },
        { playerIds: ["x"], score: 1, result: "win" },
        { playedAt: new Date(2026, 3, 5).toISOString() },
      ),
    ];
    const rows = computePlayerMonthlyTrend("p1", matches);
    expect(rows).toEqual([
      { year: 2026, month: 1, stats: { played: 1, wins: 1, losses: 0, draws: 0, winRate: 1 } },
      { year: 2026, month: 3, stats: { played: 1, wins: 0, losses: 1, draws: 0, winRate: 0 } },
    ]);
  });
});

