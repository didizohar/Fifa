import {
  applyNationalTeamsPreference,
  CUSTOM_CLUBS_LEAGUE_LABEL,
  filterClubVersionsForRandomGeneration,
  getLeagueIcon,
  groupClubVersionsByLeague,
  isDuplicateClubName,
  isNationalTeamClubVersion,
  MAX_RECENTLY_USED_CLUBS,
  NATIONAL_TEAMS_LEAGUE_LABEL,
  normalizeClubName,
  recordClubUsage,
  searchAllClubVersions,
  searchClubVersions,
  sortClubVersionsFavoritesFirst,
  validateBuiltInClubDatabase,
} from "../src/lib/clubRepository";
import type { Club, ClubVersion } from "../src/lib/types/database";

function makeClub(overrides: Partial<Club> = {}): Club {
  return {
    id: overrides.id ?? "club-1",
    name: "Real Madrid",
    country: "Spain",
    league: "La Liga",
    primary_color: "#FFFFFF",
    secondary_color: "#FEBE10",
    logo_url: null,
    group_id: null,
    notes: null,
    deleted_at: null,
    ...overrides,
  };
}

function makeClubVersion(club: Partial<Club>, starRating = 4.5): ClubVersion {
  const fullClub = makeClub(club);
  return { id: `cv-${fullClub.id}`, club_id: fullClub.id, game_version_id: "gv-1", star_rating: starRating, club: fullClub };
}

describe("normalizeClubName", () => {
  it.each([
    ["Real Madrid", "real madrid"],
    ["real madrid", "real madrid"],
    ["  REAL MADRID  ", "real madrid"],
    ["Real   Madrid", "real madrid"],
    ["  Real  Madrid  ", "real madrid"],
])("normalizes %j to %j", (input, expected) => {
    expect(normalizeClubName(input)).toBe(expected);
  });
});

describe("isDuplicateClubName", () => {
  const existing = ["Real Madrid", "FC Barcelona"];

  it("detects an exact match", () => {
    expect(isDuplicateClubName("Real Madrid", existing)).toBe(true);
  });

  it("detects a case-insensitive match", () => {
    expect(isDuplicateClubName("real madrid", existing)).toBe(true);
    expect(isDuplicateClubName("REAL MADRID", existing)).toBe(true);
  });

  it("detects a match despite leading/trailing/extra internal whitespace", () => {
    expect(isDuplicateClubName("  Real   Madrid  ", existing)).toBe(true);
  });

  it("is false for a genuinely different name", () => {
    expect(isDuplicateClubName("Real Sociedad", existing)).toBe(false);
  });

  it("is false for an empty name (nothing to collide with)", () => {
    expect(isDuplicateClubName("   ", existing)).toBe(false);
  });

  it("handles a Hebrew club name correctly (no special-casing needed -- same normalization rules)", () => {
    expect(isDuplicateClubName('בית"ר ירושלים', ['בית"ר ירושלים'])).toBe(true);
    expect(isDuplicateClubName('  בית"ר ירושלים  ', ['בית"ר ירושלים'])).toBe(true);
  });
});

describe("groupClubVersionsByLeague", () => {
  it("groups clubs under their league", () => {
    const clubVersions = [
      makeClubVersion({ id: "rm", name: "Real Madrid", league: "La Liga" }),
      makeClubVersion({ id: "mc", name: "Manchester City", league: "Premier League" }),
      makeClubVersion({ id: "fcb", name: "FC Barcelona", league: "La Liga" }),
    ];
    const groups = groupClubVersionsByLeague(clubVersions);
    const laLiga = groups.find((g) => g.league === "La Liga")!;
    expect(laLiga.clubVersions.map((cv) => cv.club.name).sort()).toEqual(["FC Barcelona", "Real Madrid"]);
  });

  it("orders known leagues in the requested display order", () => {
    const clubVersions = [
      makeClubVersion({ id: "a", league: "Bundesliga" }),
      makeClubVersion({ id: "b", league: "Premier League" }),
      makeClubVersion({ id: "c", league: "La Liga" }),
    ];
    const groups = groupClubVersionsByLeague(clubVersions);
    expect(groups.map((g) => g.league)).toEqual(["Premier League", "La Liga", "Bundesliga"]);
  });

  it("always sorts Custom Clubs last, even alphabetically before other leagues", () => {
    const clubVersions = [makeClubVersion({ id: "a", league: "Bundesliga" }), makeClubVersion({ id: "b", group_id: "group-1" })];
    const groups = groupClubVersionsByLeague(clubVersions);
    expect(groups[groups.length - 1]!.league).toBe(CUSTOM_CLUBS_LEAGUE_LABEL);
  });

  it("buckets a custom club under Custom Clubs regardless of any league value it was given", () => {
    const clubVersions = [makeClubVersion({ id: "a", group_id: "group-1", league: "La Liga" })];
    const groups = groupClubVersionsByLeague(clubVersions);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.league).toBe(CUSTOM_CLUBS_LEAGUE_LABEL);
  });

  it("groups a club with no league at all under Custom Clubs rather than dropping it", () => {
    const clubVersions = [makeClubVersion({ id: "a", league: null })];
    const groups = groupClubVersionsByLeague(clubVersions);
    expect(groups[0]!.league).toBe(CUSTOM_CLUBS_LEAGUE_LABEL);
  });

  it("puts an unrecognized (newly added) league after the known ones, alphabetically", () => {
    const clubVersions = [
      makeClubVersion({ id: "a", league: "Premier League" }),
      makeClubVersion({ id: "b", league: "Saudi Pro League" }),
      makeClubVersion({ id: "c", league: "MLS" }),
    ];
    const groups = groupClubVersionsByLeague(clubVersions);
    const names = groups.map((g) => g.league);
    expect(names.indexOf("Premier League")).toBeLessThan(names.indexOf("MLS"));
    expect(names.indexOf("MLS")).toBeLessThan(names.indexOf("Saudi Pro League")); // alphabetical among unknowns
  });
});

describe("searchClubVersions", () => {
  const clubVersions = [makeClubVersion({ id: "rm", name: "Real Madrid" }), makeClubVersion({ id: "rs", name: "Real Sociedad" }), makeClubVersion({ id: "fcb", name: "FC Barcelona" })];

  it("matches a case-insensitive substring", () => {
    expect(searchClubVersions(clubVersions, "real").map((cv) => cv.club.name).sort()).toEqual(["Real Madrid", "Real Sociedad"]);
  });

  it("returns everything for an empty/whitespace-only query", () => {
    expect(searchClubVersions(clubVersions, "   ")).toHaveLength(3);
  });

  it("returns an empty array when nothing matches", () => {
    expect(searchClubVersions(clubVersions, "juventus")).toEqual([]);
  });
});

describe("sortClubVersionsFavoritesFirst", () => {
  it("moves favorited clubs to the front, preserving relative order within each group", () => {
    const clubVersions = [
      makeClubVersion({ id: "a" }),
      makeClubVersion({ id: "b" }),
      makeClubVersion({ id: "c" }),
      makeClubVersion({ id: "d" }),
    ];
    const sorted = sortClubVersionsFavoritesFirst(clubVersions, ["c", "a"]);
    expect(sorted.map((cv) => cv.club_id)).toEqual(["a", "c", "b", "d"]);
  });

  it("is a no-op ordering when there are no favorites", () => {
    const clubVersions = [makeClubVersion({ id: "a" }), makeClubVersion({ id: "b" })];
    expect(sortClubVersionsFavoritesFirst(clubVersions, []).map((cv) => cv.club_id)).toEqual(["a", "b"]);
  });
});

describe("recordClubUsage", () => {
  it("puts the most recently used club first", () => {
    expect(recordClubUsage(["a", "b"], "c")).toEqual(["c", "a", "b"]);
  });

  it("de-duplicates -- re-using an already-recent club moves it to the front instead of appearing twice", () => {
    expect(recordClubUsage(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  it("caps the list at MAX_RECENTLY_USED_CLUBS, dropping the oldest", () => {
    const full = Array.from({ length: MAX_RECENTLY_USED_CLUBS }, (_, i) => `club-${i}`);
    const result = recordClubUsage(full, "new-club");
    expect(result).toHaveLength(MAX_RECENTLY_USED_CLUBS);
    expect(result[0]).toBe("new-club");
    expect(result).not.toContain(`club-${MAX_RECENTLY_USED_CLUBS - 1}`); // oldest fell off
  });
});

describe("filterClubVersionsForRandomGeneration", () => {
  const clubVersions = [
    makeClubVersion({ id: "rm", league: "La Liga" }, 4.5),
    makeClubVersion({ id: "mc", league: "Premier League" }, 4.5),
    makeClubVersion({ id: "everton", league: "Premier League" }, 3.0),
    makeClubVersion({ id: "custom-1", group_id: "group-1", league: null }, 3.0),
  ];

  it("filters to an exact star rating", () => {
    const result = filterClubVersionsForRandomGeneration(clubVersions, { sameStarRating: 4.5 });
    expect(result.map((cv) => cv.club_id).sort()).toEqual(["mc", "rm"]);
  });

  it("filters to a single league", () => {
    const result = filterClubVersionsForRandomGeneration(clubVersions, { sameLeague: "Premier League" });
    expect(result.map((cv) => cv.club_id).sort()).toEqual(["everton", "mc"]);
  });

  it("excludes custom clubs when includeCustom is false", () => {
    const result = filterClubVersionsForRandomGeneration(clubVersions, { includeCustom: false });
    expect(result.some((cv) => cv.club_id === "custom-1")).toBe(false);
    expect(result).toHaveLength(3);
  });

  it("includes custom clubs by default", () => {
    const result = filterClubVersionsForRandomGeneration(clubVersions, {});
    expect(result).toHaveLength(4);
  });

  it("excludes explicitly listed club ids (e.g. favorites or recently-used)", () => {
    const result = filterClubVersionsForRandomGeneration(clubVersions, { excludeClubIds: ["rm", "mc"] });
    expect(result.map((cv) => cv.club_id).sort()).toEqual(["custom-1", "everton"]);
  });

  it("combines multiple filters (same league AND excluding a specific club)", () => {
    const result = filterClubVersionsForRandomGeneration(clubVersions, { sameLeague: "Premier League", excludeClubIds: ["everton"] });
    expect(result.map((cv) => cv.club_id)).toEqual(["mc"]);
  });

  it("excludes national teams when includeNationalTeams is false", () => {
    const withNationalTeam = [...clubVersions, makeClubVersion({ id: "brazil", league: NATIONAL_TEAMS_LEAGUE_LABEL }, 5)];
    const result = filterClubVersionsForRandomGeneration(withNationalTeam, { includeNationalTeams: false });
    expect(result.some((cv) => cv.club_id === "brazil")).toBe(false);
    expect(result).toHaveLength(4);
  });

  it("includes national teams by default", () => {
    const withNationalTeam = [...clubVersions, makeClubVersion({ id: "brazil", league: NATIONAL_TEAMS_LEAGUE_LABEL }, 5)];
    const result = filterClubVersionsForRandomGeneration(withNationalTeam, {});
    expect(result.some((cv) => cv.club_id === "brazil")).toBe(true);
  });

  it("filters to an inclusive star-rating range", () => {
    const result = filterClubVersionsForRandomGeneration(clubVersions, { starRatingRange: { min: 3, max: 4 } });
    expect(result.map((cv) => cv.club_id).sort()).toEqual(["custom-1", "everton"]);
  });

  it("filters to any of several selected leagues", () => {
    const result = filterClubVersionsForRandomGeneration(clubVersions, { selectedLeagues: ["La Liga", CUSTOM_CLUBS_LEAGUE_LABEL] });
    expect(result.map((cv) => cv.club_id).sort()).toEqual(["custom-1", "rm"]);
  });
});

describe("isNationalTeamClubVersion / applyNationalTeamsPreference", () => {
  const brazil = makeClubVersion({ id: "brazil", league: NATIONAL_TEAMS_LEAGUE_LABEL }, 5);
  const realMadrid = makeClubVersion({ id: "rm", league: "La Liga" }, 4.5);
  const customNationalNamed = makeClubVersion({ id: "custom-nt", group_id: "group-1", league: NATIONAL_TEAMS_LEAGUE_LABEL }, 3);

  it("identifies a built-in National Teams club", () => {
    expect(isNationalTeamClubVersion(brazil)).toBe(true);
    expect(isNationalTeamClubVersion(realMadrid)).toBe(false);
  });

  it("never treats a custom club as a national team, even if given that league string", () => {
    expect(isNationalTeamClubVersion(customNationalNamed)).toBe(false);
  });

  it("applyNationalTeamsPreference keeps everything when true", () => {
    expect(applyNationalTeamsPreference([brazil, realMadrid], true)).toHaveLength(2);
  });

  it("applyNationalTeamsPreference drops national teams when false", () => {
    const result = applyNationalTeamsPreference([brazil, realMadrid], false);
    expect(result.map((cv) => cv.club_id)).toEqual(["rm"]);
  });
});

describe("searchAllClubVersions", () => {
  const clubVersions = [
    makeClubVersion({ id: "rm", name: "Real Madrid", league: "La Liga" } as Partial<Club>, 4.5),
    makeClubVersion({ id: "brazil", name: "Brazil", league: NATIONAL_TEAMS_LEAGUE_LABEL } as Partial<Club>, 5),
    makeClubVersion({ id: "custom-1", name: "Real Sunday League", group_id: "group-1", league: null } as Partial<Club>, 3),
  ];

  it("searches across every league at once, unlike searchClubVersions", () => {
    const result = searchAllClubVersions(clubVersions, "real");
    expect(result.map((cv) => cv.club_id).sort()).toEqual(["custom-1", "rm"]);
  });

  it("excludes national teams when includeNationalTeams is false", () => {
    const result = searchAllClubVersions(clubVersions, "", { includeNationalTeams: false });
    expect(result.some((cv) => cv.club_id === "brazil")).toBe(false);
  });

  it("excludes custom clubs when includeCustom is false", () => {
    const result = searchAllClubVersions(clubVersions, "real", { includeCustom: false });
    expect(result.map((cv) => cv.club_id)).toEqual(["rm"]);
  });
});

describe("validateBuiltInClubDatabase", () => {
  it("reports no issues for a clean, fully-populated built-in catalog", () => {
    const clean = [
      makeClubVersion({ id: "rm", name: "Real Madrid", league: "La Liga", country: "Spain" } as Partial<Club>, 4.5),
      makeClubVersion({ id: "mc", name: "Manchester City", league: "Premier League", country: "England" } as Partial<Club>, 4.5),
    ];
    expect(validateBuiltInClubDatabase(clean)).toEqual([]);
  });

  it("flags two built-in clubs whose names normalize the same", () => {
    const dup = [
      makeClubVersion({ id: "rm1", name: "Real Madrid" } as Partial<Club>),
      makeClubVersion({ id: "rm2", name: "  real   MADRID " } as Partial<Club>),
    ];
    const issues = validateBuiltInClubDatabase(dup);
    expect(issues.some((i) => i.reason === "duplicate_name")).toBe(true);
  });

  it("flags a built-in club with no league", () => {
    const issues = validateBuiltInClubDatabase([makeClubVersion({ id: "x", name: "X FC", league: null } as Partial<Club>)]);
    expect(issues.some((i) => i.reason === "missing_league")).toBe(true);
  });

  it("flags a built-in club with no country", () => {
    const issues = validateBuiltInClubDatabase([makeClubVersion({ id: "x", name: "X FC", country: null } as Partial<Club>)]);
    expect(issues.some((i) => i.reason === "missing_country")).toBe(true);
  });

  it("does not require league/country on a custom club", () => {
    const issues = validateBuiltInClubDatabase([makeClubVersion({ id: "x", name: "X FC", league: null, country: null, group_id: "group-1" } as Partial<Club>)]);
    expect(issues).toEqual([]);
  });

  it("flags a star rating outside 0.5-5.0", () => {
    expect(validateBuiltInClubDatabase([makeClubVersion({ id: "x", name: "X FC" } as Partial<Club>, 5.5)]).some((i) => i.reason === "invalid_star_rating")).toBe(true);
    expect(validateBuiltInClubDatabase([makeClubVersion({ id: "y", name: "Y FC" } as Partial<Club>, 0)]).some((i) => i.reason === "invalid_star_rating")).toBe(true);
  });

  it("flags a star rating that isn't a half-star increment", () => {
    const issues = validateBuiltInClubDatabase([makeClubVersion({ id: "x", name: "X FC" } as Partial<Club>, 3.3)]);
    expect(issues.some((i) => i.reason === "star_rating_not_half_increment")).toBe(true);
  });

  it("accepts every half-star increment from 0.5 to 5.0", () => {
    const versions = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((rating, i) => makeClubVersion({ id: `x${i}`, name: `Club ${i}` } as Partial<Club>, rating));
    expect(validateBuiltInClubDatabase(versions)).toEqual([]);
  });
});

describe("getLeagueIcon", () => {
  it("returns a distinct icon for every known built-in league", () => {
    const leagues = ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "Eredivisie", "Liga Portugal", NATIONAL_TEAMS_LEAGUE_LABEL, CUSTOM_CLUBS_LEAGUE_LABEL];
    const icons = leagues.map(getLeagueIcon);
    expect(icons.every((icon) => icon.length > 0)).toBe(true);
    expect(new Set(icons).size).toBe(leagues.length);
  });

  it("falls back to a neutral icon for an unrecognized league", () => {
    expect(getLeagueIcon("Some Brand New League")).toBe("⚽");
  });
});
