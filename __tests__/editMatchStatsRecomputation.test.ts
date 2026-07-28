/**
 * End-to-end proof that editing a match correctly flows into every derived
 * statistic. Every stat/leaderboard/record/achievement/report/trend
 * function in this codebase is a pure function of a MatchSummary[] fetched
 * fresh from the database (see src/lib/stats.ts, records.ts,
 * achievements.ts, monthlyReport.ts, trends/leagueTrends.ts) -- there is no
 * separate "editing" code path for any of them to get right or wrong. This
 * suite proves that property concretely: it builds a "before" match array,
 * computes a battery of derived stats from it, then builds the exact
 * "after" array update_match would produce for a corrected match (same
 * id/players/date, different score), and asserts each stat recomputes to
 * the specific expected new value -- not just "a number came back".
 */
import { computeAllRecords } from "../src/lib/records";
import { computePlayerAchievements } from "../src/lib/achievements";
import { generateDiscoveryItems } from "../src/lib/discovery";
import { selectInsightOfTheDay } from "../src/lib/leagueInsights";
import type { MatchSidePlayer, MatchSummary } from "../src/lib/matches";
import { computeMonthlyReport } from "../src/lib/monthlyReport";
import { computeBestDoublesPairs, computeClubPerformance, computeGoalStats, computeHeadToHead, computePlayerStats, computeStreaks } from "../src/lib/stats";
import { calculateLeagueTrendSummary } from "../src/lib/trends/leagueTrends";

function player(id: string): MatchSidePlayer {
  return { id, display_name: id, avatar_url: null, custom_color: "#000" };
}

const ROSTER: MatchSidePlayer[] = ["p1", "p2", "p3", "p4", "p5"].map(player);

const ARSENAL = { id: "club-arsenal", name: "Arsenal" };
const CHELSEA = { id: "club-chelsea", name: "Chelsea" };

function buildMatches(editedM3Score: { p1: number; p2: number; result: "win" | "loss" }): MatchSummary[] {
  const m1: MatchSummary = {
    id: "m1",
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: new Date(2026, 2, 1).toISOString(),
    sides: [
      { id: "m1-s1", side_number: 1, score: 5, penalty_score: null, result: "win", club: ARSENAL, players: [player("p1")] },
      { id: "m1-s2", side_number: 2, score: 0, penalty_score: null, result: "loss", club: CHELSEA, players: [player("p2")] },
    ],
  };

  const m2: MatchSummary = {
    id: "m2",
    match_type: "doubles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: new Date(2026, 2, 2).toISOString(),
    sides: [
      { id: "m2-s1", side_number: 1, score: 3, penalty_score: null, result: "win", club: ARSENAL, players: [player("p1"), player("p3")] },
      { id: "m2-s2", side_number: 2, score: 1, penalty_score: null, result: "loss", club: CHELSEA, players: [player("p4"), player("p5")] },
    ],
  };

  // The match under edit: same id/date/players throughout -- only the
  // score (and therefore the result) differs between "before" and "after".
  const m3: MatchSummary = {
    id: "m3",
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: new Date(2026, 2, 3).toISOString(),
    sides: [
      { id: "m3-s1", side_number: 1, score: editedM3Score.p1, penalty_score: null, result: editedM3Score.result, club: ARSENAL, players: [player("p1")] },
      {
        id: "m3-s2",
        side_number: 2,
        score: editedM3Score.p2,
        penalty_score: null,
        result: editedM3Score.result === "win" ? "loss" : "win",
        club: CHELSEA,
        players: [player("p2")],
      },
    ],
  };

  return [m1, m2, m3];
}

// Before the edit: p1 lost match 3, 0-2.
const BEFORE = buildMatches({ p1: 0, p2: 2, result: "loss" });
// After the edit: p1 actually won match 3, 6-0 (a data-entry correction).
const AFTER = buildMatches({ p1: 6, p2: 0, result: "win" });

describe("editing a match recomputes player stats (played/wins/losses/win rate)", () => {
  it("p1: 2 wins/1 loss before the correction, 3 wins/0 losses after", () => {
    expect(computePlayerStats("p1", BEFORE)).toEqual({ played: 3, wins: 2, losses: 1, draws: 0, winRate: 2 / 3 });
    expect(computePlayerStats("p1", AFTER)).toEqual({ played: 3, wins: 3, losses: 0, draws: 0, winRate: 1 });
  });

  it("p2 (the opposing player in the edited match): 1 win before, 0 wins after", () => {
    expect(computePlayerStats("p2", BEFORE)).toEqual({ played: 2, wins: 1, losses: 1, draws: 0, winRate: 0.5 });
    expect(computePlayerStats("p2", AFTER)).toEqual({ played: 2, wins: 0, losses: 2, draws: 0, winRate: 0 });
  });

  it("uninvolved players (p3/p4/p5, only in match 2) are completely unaffected by editing match 3", () => {
    for (const id of ["p3", "p4", "p5"]) {
      expect(computePlayerStats(id, BEFORE)).toEqual(computePlayerStats(id, AFTER));
    }
  });
});

describe("editing a match recomputes goals for/against/per-match and club performance", () => {
  it("p1's goals scored/conceded reflect the corrected score exactly", () => {
    expect(computeGoalStats("p1", BEFORE)).toMatchObject({ goalsScored: 8, goalsConceded: 3, cleanSheets: 1 });
    expect(computeGoalStats("p1", AFTER)).toMatchObject({ goalsScored: 14, goalsConceded: 1, cleanSheets: 2 });
  });

  it("p1's Arsenal club record updates from 2W-1L to 3W-0L", () => {
    const before = computeClubPerformance("p1", BEFORE).find((c) => c.clubId === "club-arsenal");
    const after = computeClubPerformance("p1", AFTER).find((c) => c.clubId === "club-arsenal");
    expect(before).toMatchObject({ played: 3, wins: 2, losses: 1, winRate: 2 / 3 });
    expect(after).toMatchObject({ played: 3, wins: 3, losses: 0, winRate: 1 });
  });
});

describe("editing a match recomputes current/longest streaks", () => {
  it("p1's current streak flips from a 1-loss streak to a 3-win streak", () => {
    expect(computeStreaks("p1", BEFORE).currentStreak).toEqual({ result: "loss", count: 1 });
    expect(computeStreaks("p1", AFTER).currentStreak).toEqual({ result: "win", count: 3 });
    expect(computeStreaks("p1", AFTER).longestWinStreak).toBe(3);
  });
});

describe("editing a match recomputes head-to-head between the two players involved", () => {
  it("p1 vs p2 flips from a 1-1 split to a 2-0 sweep, with goal difference updated", () => {
    const before = computeHeadToHead("p1", "p2", BEFORE);
    const after = computeHeadToHead("p1", "p2", AFTER);
    expect(before).toMatchObject({ played: 2, wins: 1, losses: 1, goalsFor: 5, goalsAgainst: 2, goalDifference: 3 });
    expect(after).toMatchObject({ played: 2, wins: 2, losses: 0, goalsFor: 11, goalsAgainst: 0, goalDifference: 11 });
  });
});

describe("editing a match does not corrupt unrelated pair statistics", () => {
  it("the [p1, p3] doubles pair from match 2 is byte-for-byte identical before and after editing the unrelated match 3", () => {
    const before = computeBestDoublesPairs(BEFORE, 1).find((row) => row.playerIds.includes("p1") && row.playerIds.includes("p3"));
    const after = computeBestDoublesPairs(AFTER, 1).find((row) => row.playerIds.includes("p1") && row.playerIds.includes("p3"));
    expect(before).toEqual(after);
    expect(before).toMatchObject({ played: 1, wins: 1, losses: 0, winRate: 1 });
  });
});

describe("editing a match recomputes group records", () => {
  it("the Biggest Victory record moves from match 1 (margin 5) to the corrected match 3 (margin 6)", () => {
    const beforeRecord = computeAllRecords(ROSTER, BEFORE).find((r) => r.id === "biggest-victory");
    const afterRecord = computeAllRecords(ROSTER, AFTER).find((r) => r.id === "biggest-victory");
    expect(beforeRecord).toMatchObject({ matchId: "m1", valueLabel: "5-0 vs p2 (+5)" });
    expect(afterRecord).toMatchObject({ matchId: "m3", valueLabel: "6-0 vs p2 (+6)" });
  });
});

describe("editing a match recomputes achievements", () => {
  it("p2 loses the 'first-win' achievement once match 3 is corrected to a loss", () => {
    const beforeIds = computePlayerAchievements("p2", BEFORE).map((a) => a.id);
    const afterIds = computePlayerAchievements("p2", AFTER).map((a) => a.id);
    expect(beforeIds).toContain("first-win");
    expect(afterIds).not.toContain("first-win");
  });

  it("p1 keeps 'first-win' in both cases -- match 1 alone already unlocks it", () => {
    expect(computePlayerAchievements("p1", BEFORE).map((a) => a.id)).toContain("first-win");
    expect(computePlayerAchievements("p1", AFTER).map((a) => a.id)).toContain("first-win");
  });
});

describe("editing a match recomputes the monthly report", () => {
  it("the Player of the Month win count and Top Scorer goal total both update", () => {
    const before = computeMonthlyReport(ROSTER, BEFORE, 2026, 2);
    const after = computeMonthlyReport(ROSTER, AFTER, 2026, 2);

    expect(before.playerOfMonthName).toBe("p1");
    expect(before.awards.find((a) => a.id === "player-of-month")?.metric).toBe(2);
    expect(after.awards.find((a) => a.id === "player-of-month")?.metric).toBe(3);

    expect(before.topScorerGoals).toBe(8);
    expect(after.topScorerGoals).toBe(14);
  });
});

describe("editing a match is safely reflected in discovery/insights/trends (no crash, valid structure)", () => {
  it("discovery highlights and the insight of the day still generate from the corrected data", () => {
    const now = new Date(2026, 2, 4);
    expect(() => generateDiscoveryItems("p1", ROSTER, AFTER, now)).not.toThrow();
    expect(() => selectInsightOfTheDay(ROSTER, AFTER, now)).not.toThrow();
    expect(Array.isArray(generateDiscoveryItems("p1", ROSTER, BEFORE, now))).toBe(true);
    expect(Array.isArray(generateDiscoveryItems("p1", ROSTER, AFTER, now))).toBe(true);
  });

  it("league trend summary still computes from the corrected data without throwing", () => {
    const now = new Date(2026, 2, 4);
    expect(() => calculateLeagueTrendSummary(ROSTER, BEFORE, now)).not.toThrow();
    const summary = calculateLeagueTrendSummary(ROSTER, AFTER, now);
    // A 3-match sample is below every trend dimension's reliable-sample
    // threshold, so every field is expected to be null here -- the point of
    // this assertion is that the shape is correct and nothing throws, not
    // that this tiny fixture produces a "hot player".
    expect(Object.keys(summary).sort()).toEqual([
      "bestAttack",
      "bestDefence",
      "biggestDecline",
      "biggestImprovement",
      "coldPlayer",
      "hotPlayer",
      "mostActive",
      "mostConsistent",
    ]);
  });
});
