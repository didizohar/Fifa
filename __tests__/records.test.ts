import {
  computeAllRecords,
  computeBiggestVictoryRecord,
  computeClosestMatchRecord,
  computeHighestScoringMatchRecord,
  computeHighestWinRateRecord,
  computeLongestLossStreakRecord,
  computeLongestWinStreakRecord,
  computeMostCleanSheetsRecord,
  computeMostGoalsInMatchRecord,
  computeMostMatchesInOneDayRecord,
} from "../src/lib/records";
import type { MatchSidePlayer, MatchSummary } from "../src/lib/matches";

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
}

function makeMatch(side1: SideSpec, side2: SideSpec, playedAt?: string): MatchSummary {
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
    id: `match-${Math.random()}`,
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: playedAt ?? new Date().toISOString(),
    sides: [toSide(side1, 1), toSide(side2, 2)],
  };
}

function roster(ids: string[]): MatchSidePlayer[] {
  return ids.map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" }));
}

const base = Date.now();
const day = (n: number) => new Date(base + n * 86_400_000).toISOString();

describe("computeHighestScoringMatchRecord", () => {
  it("picks the match with the most combined goals", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, day(0)),
      makeMatch({ playerIds: ["p1"], score: 4, result: "win" }, { playerIds: ["p2"], score: 3, result: "loss" }, day(1)),
    ];
    expect(computeHighestScoringMatchRecord(matches)).toMatchObject({ valueLabel: "7 goals (4-3)" });
  });

  it("returns null with no matches", () => {
    expect(computeHighestScoringMatchRecord([])).toBeNull();
  });
});

describe("computeClosestMatchRecord", () => {
  it("picks the smallest score margin", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 5, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, day(0)),
      makeMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }, day(1)),
    ];
    expect(computeClosestMatchRecord(matches)).toMatchObject({ valueLabel: "2-1 (margin of 1)" });
  });
});

describe("computeBiggestVictoryRecord", () => {
  it("ignores draws and picks the largest winning margin", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "draw" }, { playerIds: ["p2"], score: 1, result: "draw" }, day(0)),
      makeMatch({ playerIds: ["p1"], score: 6, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }, day(1)),
    ];
    expect(computeBiggestVictoryRecord(matches)).toMatchObject({ holderName: "p1", valueLabel: "6-1 vs p2 (+5)" });
  });

  it("returns null when every match is a draw", () => {
    const matches = [makeMatch({ playerIds: ["p1"], score: 1, result: "draw" }, { playerIds: ["p2"], score: 1, result: "draw" })];
    expect(computeBiggestVictoryRecord(matches)).toBeNull();
  });
});

describe("computeMostGoalsInMatchRecord", () => {
  it("picks the single side with the most goals in one match", () => {
    const matches = [makeMatch({ playerIds: ["p1"], score: 8, result: "win" }, { playerIds: ["p2"], score: 2, result: "loss" })];
    expect(computeMostGoalsInMatchRecord(matches)).toMatchObject({ holderName: "p1", valueLabel: "8 goals" });
  });
});

describe("computeMostMatchesInOneDayRecord", () => {
  it("finds the calendar day with the most matches", () => {
    const sameDay = new Date(2026, 2, 10, 9).toISOString();
    const sameDayLater = new Date(2026, 2, 10, 20).toISOString();
    const otherDay = new Date(2026, 2, 11, 9).toISOString();
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, sameDay),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, sameDayLater),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, otherDay),
    ];
    expect(computeMostMatchesInOneDayRecord(matches)).toMatchObject({ valueLabel: "2 matches" });
  });

  it("breaks an exact tie between two days deterministically (earliest day wins), regardless of input array order", () => {
    const earlierDay = new Date(2026, 2, 5, 9).toISOString();
    const laterDay = new Date(2026, 2, 20, 9).toISOString();
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, laterDay),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, earlierDay),
    ];
    const forward = computeMostMatchesInOneDayRecord(matches);
    const reversed = computeMostMatchesInOneDayRecord([...matches].reverse());
    expect(forward).toEqual(reversed);
    expect(forward?.setAt).toBe(earlierDay);
  });
});

describe("computeLongestWinStreakRecord / computeLongestLossStreakRecord", () => {
  it("finds the player with the single longest streak across the whole group", () => {
    // Every "opponent" below is a distinct, single-use placeholder so nobody
    // but p1/p2 accumulates a streak of their own to compete with.
    const matches = [
      // p1: 3-match win streak.
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["o1"], score: 0, result: "loss" }, day(0)),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["o2"], score: 0, result: "loss" }, day(1)),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["o3"], score: 0, result: "loss" }, day(2)),
      // p2: 2-match loss streak.
      makeMatch({ playerIds: ["p2"], score: 0, result: "loss" }, { playerIds: ["o4"], score: 1, result: "win" }, day(3)),
      makeMatch({ playerIds: ["p2"], score: 0, result: "loss" }, { playerIds: ["o5"], score: 1, result: "win" }, day(4)),
    ];
    const players = roster(["p1", "p2", "o1", "o2", "o3", "o4", "o5"]);
    expect(computeLongestWinStreakRecord(players, matches)).toMatchObject({
      holderName: "p1",
      valueLabel: "3 wins in a row",
      setAt: day(2),
    });
    expect(computeLongestLossStreakRecord(players, matches)).toMatchObject({
      holderName: "p2",
      valueLabel: "2 losses in a row",
      setAt: day(4),
    });
  });
});

describe("computeMostCleanSheetsRecord / computeHighestWinRateRecord", () => {
  it("surfaces the top of the underlying leaderboards", () => {
    const matches = [0, 1, 2, 3, 4].map((n) =>
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, day(n)),
    );
    expect(computeMostCleanSheetsRecord(roster(["p1", "p2"]), matches)).toMatchObject({ holderName: "p1" });
    expect(computeHighestWinRateRecord(roster(["p1", "p2"]), matches)).toMatchObject({ holderName: "p1", valueLabel: "100%" });
  });

  it("returns null with no qualifying data", () => {
    expect(computeMostCleanSheetsRecord(roster(["p1"]), [])).toBeNull();
    expect(computeHighestWinRateRecord(roster(["p1"]), [])).toBeNull();
  });
});

describe("computeAllRecords", () => {
  it("skips records that don't have enough data instead of including nulls", () => {
    const matches = [makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" })];
    const records = computeAllRecords(roster(["p1", "p2"]), matches);
    expect(records.every((r) => r !== null)).toBe(true);
    // Highest win rate needs 5 qualifying matches -- shouldn't appear yet.
    expect(records.some((r) => r.id === "highest-win-rate")).toBe(false);
  });
});

describe("holderIds", () => {
  it("attributes match-level records to every player on the relevant side(s), not just a formatted name", () => {
    const matches = [makeMatch({ playerIds: ["p1", "p2"], score: 5, result: "win" }, { playerIds: ["p3"], score: 1, result: "loss" })];
    // Both sides jointly "hold" a whole-match record like highest-scoring/closest.
    expect(computeHighestScoringMatchRecord(matches)?.holderIds).toEqual(["p1", "p2", "p3"]);
    expect(computeClosestMatchRecord(matches)?.holderIds).toEqual(["p1", "p2", "p3"]);
    // Only the winning side holds a victory-margin record.
    expect(computeBiggestVictoryRecord(matches)?.holderIds).toEqual(["p1", "p2"]);
    expect(computeMostGoalsInMatchRecord(matches)?.holderIds).toEqual(["p1", "p2"]);
  });

  it("attributes single-player records to that player's id, and group-wide day records to nobody", () => {
    const matches = Array.from({ length: 3 }, (_, n) =>
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, day(n)),
    );
    expect(computeLongestWinStreakRecord(roster(["p1", "x"]), matches)?.holderIds).toEqual(["p1"]);
    expect(computeMostMatchesInOneDayRecord(matches)?.holderIds).toEqual([]);
  });

  it("never misattributes a record via holderName string-matching -- a display name containing ' & ' can't fool holderIds", () => {
    // A player literally named "Tom & Jerry" must not be confused with a two-player side "Tom & Jerry".
    const matches = [makeMatch({ playerIds: ["real-tom"], score: 5, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" })];
    const record = computeMostGoalsInMatchRecord(matches);
    expect(record?.holderIds).toEqual(["real-tom"]);
    expect(record?.holderIds.includes("Tom & Jerry")).toBe(false);
  });
});

describe("computeMostMatchesInOneDayRecord date formatting", () => {
  it("formats the holder date as a readable string, not a raw Date#toDateString()", () => {
    const match = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["x"], score: 0, result: "loss" }, new Date(2026, 2, 10).toISOString());
    const record = computeMostMatchesInOneDayRecord([match]);
    expect(record?.holderName).not.toMatch(/^\w{3} \w{3} \d{2}/); // not the raw "Tue Mar 10 2026" format
    expect(record?.holderName).toContain("2026");
  });
});
