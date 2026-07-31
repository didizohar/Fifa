import { computeSeasonClubRankings, computeSeasonStatistics } from "../src/lib/seasonStatistics";
import type { MatchSidePlayer, MatchSummary } from "../src/lib/matches";
import type { Season } from "../src/lib/types/database";

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
  club?: { id: string; name: string } | null;
}

let idCounter = 0;

function makeMatch(side1: SideSpec, side2: SideSpec, playedAt: string): MatchSummary {
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
    match_type: "singles",
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: playedAt,
    sides: [toSide(side1, 1), toSide(side2, 2)],
  };
}

const season: Season = {
  id: "season-1",
  group_id: "group-1",
  name: "Season 1",
  is_active: false,
  start_date: "2026-03-01T00:00:00.000Z",
  // Midday (not the literal end of the month) so this stays in March
  // regardless of the test runner's local timezone offset.
  end_date: "2026-03-20T12:00:00.000Z",
  created_at: "2026-03-01T00:00:00.000Z",
};

const roster: MatchSidePlayer[] = ["p1", "p2"].map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" }));

describe("computeSeasonStatistics", () => {
  it("anchors timelines at the season's end_date, not at `now`, for an archived season", () => {
    const matches = [makeMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }, "2026-03-15T00:00:00.000Z")];
    const stats = computeSeasonStatistics(season, roster, matches, new Date("2026-07-30T00:00:00.000Z"));
    // The last matches-over-time bucket should fall within March 2026 (the season), not July (the real "now").
    const lastBucket = stats.matchesOverTime.at(-1);
    expect(lastBucket?.bucketStart.startsWith("2026-03")).toBe(true);
  });

  it("ranks goals per player using the existing leaderboard engine", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, "2026-03-05T00:00:00.000Z"),
    ];
    const stats = computeSeasonStatistics(season, roster, matches);
    expect(stats.goalsPerPlayer[0]?.playerId).toBe("p1");
  });

  it("returns empty (not crashing) datasets for a season with no matches", () => {
    const stats = computeSeasonStatistics(season, roster, []);
    expect(stats.clubUsage).toEqual([]);
    expect(stats.winRateTrend).toEqual([]);
  });
});

describe("computeSeasonClubRankings", () => {
  const clubUsage = [
    { clubId: "c1", clubName: "Real Madrid", matchesPlayed: 5, winRate: 0.4, share: 0.5, goalsFor: 10, goalsAgainst: 8 },
    { clubId: "c2", clubName: "Barcelona", matchesPlayed: 3, winRate: 0.8, share: 0.3, goalsFor: 12, goalsAgainst: 4 },
  ];

  it("sorts by matches played for mostUsed", () => {
    expect(computeSeasonClubRankings(clubUsage).mostUsed.map((c) => c.clubName)).toEqual(["Real Madrid", "Barcelona"]);
  });

  it("sorts by win rate for highestWinRate", () => {
    expect(computeSeasonClubRankings(clubUsage).highestWinRate.map((c) => c.clubName)).toEqual(["Barcelona", "Real Madrid"]);
  });

  it("sorts by goals for for highestScoring", () => {
    expect(computeSeasonClubRankings(clubUsage).highestScoring.map((c) => c.clubName)).toEqual(["Barcelona", "Real Madrid"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...clubUsage];
    computeSeasonClubRankings(clubUsage);
    expect(clubUsage).toEqual(copy);
  });
});
