import {
  computeLongestMatchDay,
  computeSeasonAwards,
  computeSeasonCardSummary,
  computeSeasonOverview,
  matchesInSeasonWindow,
} from "../src/lib/seasonReport";
import type { MatchSidePlayer, MatchSummary } from "../src/lib/matches";
import type { Season } from "../src/lib/types/database";

interface SideSpec {
  playerIds: string[];
  score: number;
  result: "win" | "loss" | "draw";
  club?: { id: string; name: string } | null;
}

let idCounter = 0;

function makeMatch(side1: SideSpec, side2: SideSpec, opts?: { playedAt?: string; matchType?: "singles" | "doubles" }): MatchSummary {
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
    match_type: opts?.matchType ?? (side1.playerIds.length === 2 ? "doubles" : "singles"),
    is_overtime: false,
    is_penalties: false,
    notes: null,
    played_at: opts?.playedAt ?? "2026-03-15T19:00:00.000Z",
    sides: [toSide(side1, 1), toSide(side2, 2)],
  };
}

function makeSeason(overrides: Partial<Season> = {}): Season {
  return {
    id: "season-1",
    group_id: "group-1",
    name: "Season 1",
    is_active: false,
    start_date: "2026-03-01T00:00:00.000Z",
    end_date: "2026-03-31T23:59:59.000Z",
    created_at: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

const roster: MatchSidePlayer[] = ["p1", "p2", "p3", "p4"].map((id) => ({ id, display_name: id, avatar_url: null, custom_color: "#000" }));

describe("matchesInSeasonWindow", () => {
  it("keeps only matches within [start_date, end_date] for an archived season", () => {
    const season = makeSeason();
    const inWindow = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: "2026-03-15T00:00:00.000Z" });
    const before = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: "2026-02-01T00:00:00.000Z" });
    const after = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: "2026-04-01T00:00:00.000Z" });
    const result = matchesInSeasonWindow([before, inWindow, after], season);
    expect(result.map((m) => m.id)).toEqual([inWindow.id]);
  });

  it("uses `now` as the end boundary for a still-active season (no end_date)", () => {
    const activeSeason = makeSeason({ is_active: true, end_date: null });
    const recent = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: "2026-03-20T00:00:00.000Z" });
    const future = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: "2026-04-15T00:00:00.000Z" });
    const result = matchesInSeasonWindow([recent, future], activeSeason, new Date("2026-04-01T00:00:00.000Z"));
    expect(result.map((m) => m.id)).toEqual([recent.id]);
  });

  it("season switching -- two consecutive seasons never leak each other's matches", () => {
    const seasonOne = makeSeason({ id: "s1", name: "Season 1", start_date: "2026-01-01T00:00:00.000Z", end_date: "2026-01-31T23:59:59.000Z" });
    const seasonTwo = makeSeason({ id: "s2", name: "Season 2", start_date: "2026-02-01T00:00:00.000Z", end_date: "2026-02-28T23:59:59.000Z" });
    const matchInSeasonOne = makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: "2026-01-15T12:00:00.000Z" });
    const matchInSeasonTwo = makeMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }, { playedAt: "2026-02-15T12:00:00.000Z" });
    const all = [matchInSeasonOne, matchInSeasonTwo];

    expect(matchesInSeasonWindow(all, seasonOne).map((m) => m.id)).toEqual([matchInSeasonOne.id]);
    expect(matchesInSeasonWindow(all, seasonTwo).map((m) => m.id)).toEqual([matchInSeasonTwo.id]);
  });

  it("handles a large season (hundreds of matches) without misclassifying any", () => {
    const season = makeSeason();
    const inWindow = Array.from({ length: 300 }, (_, i) =>
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: `2026-03-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z` }),
    );
    const outOfWindow = Array.from({ length: 50 }, (_, i) =>
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: `2026-05-${String((i % 28) + 1).padStart(2, "0")}T10:00:00.000Z` }),
    );
    const result = matchesInSeasonWindow([...inWindow, ...outOfWindow], season);
    expect(result).toHaveLength(300);
  });
});

describe("computeSeasonCardSummary (empty season)", () => {
  it("handles a season with zero matches and zero sessions gracefully end-to-end", () => {
    const season = makeSeason({ is_active: true, end_date: null });
    const summary = computeSeasonCardSummary(season, roster, [], []);
    expect(summary).toEqual({
      season,
      championName: null,
      totalMatches: 0,
      totalGoals: 0,
      totalPlayers: 0,
      totalSessions: 0,
      averageGoalsPerMatch: null,
    });
  });
});

describe("computeLongestMatchDay", () => {
  it("finds the calendar day with the most matches", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: "2026-03-10T18:00:00.000Z" }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: "2026-03-10T19:00:00.000Z" }),
      makeMatch({ playerIds: ["p1"], score: 1, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: "2026-03-11T18:00:00.000Z" }),
    ];
    const result = computeLongestMatchDay(matches);
    expect(result?.matchesPlayed).toBe(2);
  });

  it("returns null for no matches", () => {
    expect(computeLongestMatchDay([])).toBeNull();
  });
});

describe("computeSeasonCardSummary", () => {
  it("summarizes a season with matches", () => {
    const season = makeSeason();
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }),
      makeMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
    ];
    const summary = computeSeasonCardSummary(season, roster, matches, []);
    expect(summary.totalMatches).toBe(2);
    expect(summary.totalGoals).toBe(6);
    expect(summary.championName).toBe("p1");
    expect(summary.averageGoalsPerMatch).toBe(3);
  });

  it("handles an empty season gracefully", () => {
    const season = makeSeason();
    const summary = computeSeasonCardSummary(season, roster, [], []);
    expect(summary.totalMatches).toBe(0);
    expect(summary.championName).toBeNull();
    expect(summary.averageGoalsPerMatch).toBeNull();
  });

  it("counts only sessions ended within the season window", () => {
    const season = makeSeason();
    const sessions = ["2026-03-10T00:00:00.000Z", "2026-02-01T00:00:00.000Z", "2026-03-25T00:00:00.000Z"];
    const summary = computeSeasonCardSummary(season, roster, [], sessions);
    expect(summary.totalSessions).toBe(2);
  });
});

describe("computeSeasonOverview", () => {
  it("names champion, runner-up, and third place from the season standings", () => {
    const season = makeSeason();
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 3, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }),
      makeMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p3"], score: 0, result: "loss" }),
      makeMatch({ playerIds: ["p2"], score: 1, result: "win" }, { playerIds: ["p4"], score: 0, result: "loss" }),
      makeMatch({ playerIds: ["p3"], score: 1, result: "win" }, { playerIds: ["p4"], score: 0, result: "loss" }),
    ];
    const overview = computeSeasonOverview(roster, matches, [], season);
    expect(overview.champion?.name).toBe("p1");
    expect(overview.totalMatches).toBe(4);
    expect(overview.mostPlayedClub).toBeNull();
  });

  it("finds the most-played club when clubs are recorded", () => {
    const season = makeSeason();
    const matches = [
      makeMatch(
        { playerIds: ["p1"], score: 1, result: "win", club: { id: "c1", name: "Real Madrid" } },
        { playerIds: ["p2"], score: 0, result: "loss", club: { id: "c2", name: "Barcelona" } },
      ),
      makeMatch(
        { playerIds: ["p1"], score: 1, result: "win", club: { id: "c1", name: "Real Madrid" } },
        { playerIds: ["p3"], score: 0, result: "loss", club: { id: "c3", name: "Juventus" } },
      ),
    ];
    expect(computeSeasonOverview(roster, matches, [], season).mostPlayedClub?.clubName).toBe("Real Madrid");
  });
});

describe("computeSeasonAwards", () => {
  it("crowns a golden boot from goals scored", () => {
    const matches = [
      makeMatch({ playerIds: ["p1"], score: 5, result: "win" }, { playerIds: ["p2"], score: 1, result: "loss" }),
      makeMatch({ playerIds: ["p1"], score: 4, result: "win" }, { playerIds: ["p3"], score: 0, result: "loss" }),
    ];
    expect(computeSeasonAwards(roster, matches).goldenBoot?.playerName).toBe("p1");
  });

  it("finds the best duo among qualifying doubles pairs", () => {
    const matches = Array.from({ length: 3 }, (_, i) =>
      makeMatch({ playerIds: ["p1", "p2"], score: 2, result: "win" }, { playerIds: ["p3", "p4"], score: 0, result: "loss" }, { playedAt: `2026-03-0${i + 1}T18:00:00.000Z` }),
    );
    expect(computeSeasonAwards(roster, matches).bestDuo?.playerName).toBe("p1 & p2");
  });

  it("finds the biggest surprise -- a lower-win-rate side beating a stronger one", () => {
    const matches = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeMatch({ playerIds: ["p1"], score: 2, result: "win" }, { playerIds: ["p2"], score: 0, result: "loss" }, { playedAt: `2026-03-0${i + 1}T18:00:00.000Z` }),
      ),
      makeMatch({ playerIds: ["p1"], score: 0, result: "loss" }, { playerIds: ["p2"], score: 3, result: "win" }, { playedAt: "2026-03-10T18:00:00.000Z" }),
    ];
    const surprise = computeSeasonAwards(roster, matches).biggestSurprise;
    expect(surprise?.playerName).toBe("p2");
  });

  it("returns null awards gracefully for a season with no matches", () => {
    const awards = computeSeasonAwards(roster, []);
    expect(awards.goldenBoot).toBeNull();
    expect(awards.bestDuo).toBeNull();
    expect(awards.mostImproved).toBeNull();
    expect(awards.biggestSurprise).toBeNull();
  });
});
