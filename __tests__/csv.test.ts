import { leaderboardToCsv, matchesToCsv, playerStatsToCsv, toCsv } from "../src/lib/csv";
import type { LeaderboardRow } from "../src/lib/stats";
import type { MatchSummary } from "../src/lib/matches";

describe("toCsv", () => {
  it("joins headers and rows with commas and CRLF line endings", () => {
    expect(toCsv(["A", "B"], [[1, 2], [3, 4]])).toBe("A,B\r\n1,2\r\n3,4");
  });

  it("quotes and escapes cells containing commas, quotes, or newlines", () => {
    expect(toCsv(["Name"], [["Smith, John"]])).toBe('Name\r\n"Smith, John"');
    expect(toCsv(["Name"], [['Say "hi"']])).toBe('Name\r\n"Say ""hi"""');
    expect(toCsv(["Name"], [["line1\nline2"]])).toBe('Name\r\n"line1\nline2"');
  });

  it("returns just the header row for no data rows", () => {
    expect(toCsv(["A", "B"], [])).toBe("A,B");
  });
});

function makeMatch(
  side1: { playerIds: string[]; score: number; result: "win" | "loss" | "draw"; club?: { id: string; name: string } | null },
  side2: { playerIds: string[]; score: number; result: "win" | "loss" | "draw"; club?: { id: string; name: string } | null },
  opts?: { matchType?: "singles" | "doubles"; playedAt?: string; isPenalties?: boolean },
): MatchSummary {
  const toSide = (spec: typeof side1, sideNumber: 1 | 2) => ({
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
    is_penalties: opts?.isPenalties ?? false,
    notes: null,
    played_at: opts?.playedAt ?? "2026-07-01T12:00:00.000Z",
    sides: [toSide(side1, 1), toSide(side2, 2)],
  };
}

describe("matchesToCsv", () => {
  it("serializes each match's sides, scores, clubs, and penalty flag", () => {
    const matches = [
      makeMatch(
        { playerIds: ["Alice"], score: 3, result: "win", club: { id: "c1", name: "Barcelona" } },
        { playerIds: ["Bob"], score: 1, result: "loss" },
        { isPenalties: true },
      ),
    ];
    const csv = matchesToCsv(matches);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "Date,Type,Side 1 Players,Side 1 Club,Side 1 Score,Side 1 Result,Side 2 Players,Side 2 Club,Side 2 Score,Side 2 Result,Penalties",
    );
    expect(lines[1]).toBe("2026-07-01T12:00:00.000Z,singles,Alice,Barcelona,3,win,Bob,,1,loss,yes");
  });
});

describe("playerStatsToCsv", () => {
  it("computes and serializes each player's record, goals, and streaks", () => {
    const players = [{ id: "p1", display_name: "Alice", avatar_url: null, custom_color: "#000" }];
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
    ];
    const csv = playerStatsToCsv(players, matches);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(
      "Player,Played,Wins,Losses,Draws,Win Rate %,Goals Scored,Goals Conceded,Goal Difference,Clean Sheets,Current Streak,Longest Win Streak,Longest Loss Streak",
    );
    expect(lines[1]).toBe("Alice,2,2,0,0,100,3,0,3,2,2 win,2,0");
  });
});

describe("leaderboardToCsv", () => {
  it("numbers rows by position and includes the formatted value/detail", () => {
    const rows: LeaderboardRow[] = [
      { playerId: "p1", playerName: "Alice", avatarUrl: null, color: "#000", value: 62, valueLabel: "62%", detailKey: "detail", detailParams: {} },
      { playerId: "p2", playerName: "Bob", avatarUrl: null, color: "#000", value: 55, valueLabel: "55%", detailKey: "detail", detailParams: {} },
    ];
    const t = () => "Win rate";
    expect(leaderboardToCsv(rows, t)).toBe("Rank,Player,Value,Detail\r\n1,Alice,62%,Win rate\r\n2,Bob,55%,Win rate");
  });
});
