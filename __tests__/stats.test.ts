import { computeAllRecordsFromRows, computePlayerStats, computeRecordFromRows } from "../src/lib/stats";
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
