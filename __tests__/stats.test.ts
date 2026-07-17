import {
  computeAllRecordsFromRows,
  computeBiggestLoss,
  computeBiggestWin,
  computeClubPerformance,
  computeDoublesPartnerships,
  computeGoalStats,
  computeHeadToHead,
  computeLastNStats,
  computePlayerStats,
  computeRecordFromRows,
  computeStreaks,
  findSides,
} from "../src/lib/stats";
import type { MatchSummary, PlayerRecordRow } from "../src/lib/matches";

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
  opts?: { matchType?: "singles" | "doubles"; playedAt?: string },
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
    is_overtime: false,
    is_penalties: false,
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
  it("only counts matches played directly against the given opponent", () => {
    const matches = [
      makeDetailedMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p3"], score: 1, result: "win" }),
      makeDetailedMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }),
    ];
    expect(computeHeadToHead("p1", "p2", matches)).toEqual({ played: 2, wins: 2, losses: 0, draws: 0, winRate: 1 });
    expect(computeHeadToHead("p1", "p3", matches)).toEqual({ played: 1, wins: 0, losses: 1, draws: 0, winRate: 0 });
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
