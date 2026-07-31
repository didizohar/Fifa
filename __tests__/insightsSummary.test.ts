import { computeInsightsSummary, computeMostFrequentRivalry } from "../src/lib/insightsSummary";
import type { MatchSidePlayer, MatchSummary } from "../src/lib/matches";

function player(id: string): MatchSidePlayer {
  return { id, display_name: id, avatar_url: null, custom_color: "#000" };
}

function makeMatch(playerId: string, opponentId: string, score: number, opponentScore: number, result: "win" | "loss" | "draw", playedAt: string): MatchSummary {
  return {
    id: `match-${playerId}-${opponentId}-${playedAt}`,
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: playedAt,
    sides: [
      { id: `s1-${playedAt}-${playerId}`, side_number: 1, score, penalty_score: null, result, club: null, players: [player(playerId)] },
      {
        id: `s2-${playedAt}-${opponentId}`,
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

describe("computeMostFrequentRivalry", () => {
  const roster = [player("p1"), player("p2"), player("p3")];

  it("returns null when nobody has played anybody", () => {
    expect(computeMostFrequentRivalry(roster, [])).toBeNull();
  });

  it("picks the pair with the most shared matches", () => {
    const matches = [
      makeMatch("p1", "p2", 1, 0, "win", "2026-03-01"),
      makeMatch("p1", "p2", 0, 1, "loss", "2026-03-02"),
      makeMatch("p1", "p2", 2, 0, "win", "2026-03-03"),
      makeMatch("p1", "p3", 1, 0, "win", "2026-03-04"),
    ];
    const rivalry = computeMostFrequentRivalry(roster, matches);
    expect(rivalry).toEqual({ playerAName: "p1", playerBName: "p2", matchesPlayed: 3 });
  });
});

describe("computeInsightsSummary", () => {
  const roster = [player("p1"), player("p2"), player("p3")];

  it("returns every card as null for a completely empty league, without throwing", () => {
    const now = new Date(2026, 2, 15);
    const summary = computeInsightsSummary(roster, [], now);
    expect(summary).toEqual({
      bestForm: null,
      worstForm: null,
      playerOfMonth: null,
      topScorer: null,
      bestDefense: null,
      biggestVictory: null,
      mostFrequentRivalry: null,
      longestWinStreak: null,
      longestLossStreak: null,
      mostImprovedPlayer: null,
    });
  });

  it("identifies the top scorer by total goals across all matches", () => {
    const now = new Date(2026, 2, 15);
    const matches = [
      makeMatch("p1", "p2", 5, 0, "win", new Date(2026, 2, 1).toISOString()),
      makeMatch("p1", "p3", 3, 0, "win", new Date(2026, 2, 2).toISOString()),
      makeMatch("p2", "p3", 1, 0, "win", new Date(2026, 2, 3).toISOString()),
    ];
    const summary = computeInsightsSummary(roster, matches, now);
    expect(summary.topScorer).toEqual({ playerName: "p1", value: 8 });
  });

  it("identifies the biggest victory record", () => {
    const now = new Date(2026, 2, 15);
    const matches = [
      makeMatch("p1", "p2", 6, 0, "win", new Date(2026, 2, 1).toISOString()),
      makeMatch("p2", "p3", 1, 0, "win", new Date(2026, 2, 2).toISOString()),
    ];
    const summary = computeInsightsSummary(roster, matches, now);
    expect(summary.biggestVictory).toMatchObject({ id: "biggest-victory", holderName: "p1" });
  });

  it("identifies the most frequent rivalry among the roster", () => {
    const now = new Date(2026, 2, 15);
    const matches = [
      makeMatch("p1", "p2", 1, 0, "win", new Date(2026, 2, 1).toISOString()),
      makeMatch("p1", "p2", 0, 1, "loss", new Date(2026, 2, 2).toISOString()),
    ];
    const summary = computeInsightsSummary(roster, matches, now);
    expect(summary.mostFrequentRivalry).toEqual({ playerAName: "p1", playerBName: "p2", matchesPlayed: 2 });
  });

  it("identifies the current month's player of the month using the monthly report engine", () => {
    const now = new Date(2026, 2, 15);
    const matches = [
      makeMatch("p1", "p2", 2, 0, "win", new Date(2026, 2, 1).toISOString()),
      makeMatch("p1", "p3", 2, 0, "win", new Date(2026, 2, 2).toISOString()),
    ];
    const summary = computeInsightsSummary(roster, matches, now);
    expect(summary.playerOfMonth).toEqual({ playerName: "p1", value: 2 });
  });
});
