import { computeSessionInsights } from "../../src/lib/rotation/sessionInsights";
import type { MatchSidePlayer, MatchSummary } from "../../src/lib/matches";

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
  club?: { id: string; name: string } | null;
}

let idCounter = 0;

function makeMatch(side1: SideSpec, side2: SideSpec, opts?: { playedAt?: string }): MatchSummary {
  idCounter += 1;
  const toSide = (spec: SideSpec, sideNumber: 1 | 2) => ({
    id: `side-${sideNumber}-${idCounter}`,
    side_number: sideNumber,
    score: spec.score,
    penalty_score: null,
    result: spec.result,
    club: spec.club ?? null,
    players: spec.playerIds.map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" })),
  });

  return {
    id: `match-${idCounter}`,
    match_type: "doubles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: opts?.playedAt ?? "2026-07-30T19:00:00.000Z",
    sides: [toSide(side1, 1), toSide(side2, 2)],
  };
}

const roster: MatchSidePlayer[] = ["p1", "p2", "p3", "p4"].map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" }));

describe("computeSessionInsights", () => {
  it("returns all-null/zeroed insights for an empty session", () => {
    const insights = computeSessionInsights(roster, []);
    expect(insights).toEqual({
      matchesPlayed: 0,
      totalGoals: 0,
      highestScoringMatch: null,
      winner: null,
      mvp: null,
      bestClub: null,
      biggestUpset: null,
    });
  });

  it("counts matches played and total goals across the session", () => {
    const matches = [
      makeMatch({ playerIds: ["p1", "p2"], score: 3, result: "win" }, { playerIds: ["p3", "p4"], score: 1, result: "loss" }),
      makeMatch({ playerIds: ["p1", "p2"], score: 2, result: "win" }, { playerIds: ["p3", "p4"], score: 2, result: "draw" }),
    ];
    const insights = computeSessionInsights(roster, matches);
    expect(insights.matchesPlayed).toBe(2);
    expect(insights.totalGoals).toBe(3 + 1 + 2 + 2);
  });

  it("finds the highest-scoring match", () => {
    const matches = [
      makeMatch({ playerIds: ["p1", "p2"], score: 1, result: "win" }, { playerIds: ["p3", "p4"], score: 0, result: "loss" }),
      makeMatch({ playerIds: ["p1", "p2"], score: 5, result: "win" }, { playerIds: ["p3", "p4"], score: 4, result: "loss" }),
    ];
    const insights = computeSessionInsights(roster, matches);
    expect(insights.highestScoringMatch?.valueLabelKey).toBe("records.valueGoalsWithScore");
    expect(insights.highestScoringMatch?.valueLabelParams).toEqual({ goals: 9, score: "5-4" });
  });

  it("names the pair with the best session record as the winner", () => {
    const matches = [
      makeMatch({ playerIds: ["p1", "p2"], score: 3, result: "win" }, { playerIds: ["p3", "p4"], score: 1, result: "loss" }),
      makeMatch({ playerIds: ["p1", "p2"], score: 2, result: "win" }, { playerIds: ["p3", "p4"], score: 0, result: "loss" }),
    ];
    const insights = computeSessionInsights(roster, matches);
    expect(insights.winner).toEqual({ name: "p1 & p2", wins: 2, losses: 0, draws: 0 });
  });

  it("names the individual player with the best session record as MVP", () => {
    const matches = [
      makeMatch({ playerIds: ["p1", "p2"], score: 3, result: "win" }, { playerIds: ["p3", "p4"], score: 1, result: "loss" }),
      makeMatch({ playerIds: ["p1", "p3"], score: 2, result: "win" }, { playerIds: ["p2", "p4"], score: 0, result: "loss" }),
    ];
    // p1 played both matches and won both -- the only 2-win, 0-loss player.
    const insights = computeSessionInsights(roster, matches);
    expect(insights.mvp?.name).toBe("p1");
    expect(insights.mvp?.wins).toBe(2);
  });

  it("finds the club with the best session win rate", () => {
    const matches = [
      makeMatch(
        { playerIds: ["p1", "p2"], score: 2, result: "win", club: { id: "c2", name: "Barcelona" } },
        { playerIds: ["p3", "p4"], score: 1, result: "loss", club: { id: "c1", name: "Real Madrid" } },
      ),
      makeMatch(
        { playerIds: ["p1", "p3"], score: 3, result: "win", club: { id: "c2", name: "Barcelona" } },
        { playerIds: ["p2", "p4"], score: 0, result: "loss", club: { id: "c1", name: "Real Madrid" } },
      ),
    ];
    const insights = computeSessionInsights(roster, matches);
    expect(insights.bestClub?.clubName).toBe("Barcelona");
    expect(insights.bestClub?.winRate).toBe(1);
  });

  it("finds the biggest upset -- the match where the lower-win-rate-for-the-session pair still won", () => {
    const matches = [
      // p1+p2 build a strong session record (3 wins) against various opponents...
      makeMatch({ playerIds: ["p1", "p2"], score: 3, result: "win" }, { playerIds: ["p3", "p4"], score: 0, result: "loss" }, { playedAt: "2026-07-30T19:00:00.000Z" }),
      makeMatch({ playerIds: ["p1", "p2"], score: 2, result: "win" }, { playerIds: ["p3", "p4"], score: 1, result: "loss" }, { playedAt: "2026-07-30T19:10:00.000Z" }),
      makeMatch({ playerIds: ["p1", "p2"], score: 4, result: "win" }, { playerIds: ["p3", "p4"], score: 0, result: "loss" }, { playedAt: "2026-07-30T19:20:00.000Z" }),
      // ...then loses once to the weaker pair -- the upset.
      makeMatch({ playerIds: ["p1", "p2"], score: 1, result: "loss" }, { playerIds: ["p3", "p4"], score: 5, result: "win" }, { playedAt: "2026-07-30T19:30:00.000Z" }),
    ];
    const insights = computeSessionInsights(roster, matches);
    expect(insights.biggestUpset).not.toBeNull();
    expect(insights.biggestUpset?.winnerName).toBe("p3 & p4");
    expect(insights.biggestUpset?.loserName).toBe("p1 & p2");
    expect(insights.biggestUpset?.loserSessionWinRate).toBeGreaterThan(insights.biggestUpset!.winnerSessionWinRate);
  });

  it("returns null for biggestUpset when every result matched session form (no doubles, or no upsets)", () => {
    const matches = [makeMatch({ playerIds: ["p1", "p2"], score: 3, result: "win" }, { playerIds: ["p3", "p4"], score: 0, result: "loss" })];
    expect(computeSessionInsights(roster, matches).biggestUpset).toBeNull();
  });
});
