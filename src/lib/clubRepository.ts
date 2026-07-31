import type { ClubVersion } from "./types/database";

/**
 * Case/whitespace-insensitive normalization for duplicate club-name
 * detection -- "Real Madrid", "real madrid", and "  REAL   MADRID  " must
 * all collapse to the same key. Mirrors normalize_club_name() in
 * supabase/migrations/20260729090000_club_repository_schema.sql exactly,
 * so a client-side pre-check and the database's own unique index always
 * agree on what counts as a duplicate.
 */
export function normalizeClubName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** True if `name` normalizes to the same key as any of `existingNames`. */
export function isDuplicateClubName(name: string, existingNames: readonly string[]): boolean {
  const normalized = normalizeClubName(name);
  if (normalized.length === 0) return false;
  return existingNames.some((existing) => normalizeClubName(existing) === normalized);
}

/** Well-known leagues sort first, in this order; anything else (a newly added league) falls back to alphabetical, and "Custom Clubs" always sorts last regardless. Adding a new league to the data never requires touching this list -- it only affects display order, never which leagues appear. */
const KNOWN_LEAGUE_ORDER = ["Premier League", "La Liga", "Serie A", "Bundesliga", "Ligue 1", "Eredivisie", "Liga Portugal", "National Teams"];
export const CUSTOM_CLUBS_LEAGUE_LABEL = "Custom Clubs";
export const NATIONAL_TEAMS_LEAGUE_LABEL = "National Teams";

/** A small flag/emoji glyph shown next to a league name in the picker -- purely decorative, never the only way a league is identified (its name is always shown alongside). Falls back to a neutral ball for any league not in this list, so a newly added league never renders with a missing icon. */
const LEAGUE_ICONS: Record<string, string> = {
  "Premier League": "🏴",
  "La Liga": "🇪🇸",
  "Serie A": "🇮🇹",
  Bundesliga: "🇩🇪",
  "Ligue 1": "🇫🇷",
  Eredivisie: "🇳🇱",
  "Liga Portugal": "🇵🇹",
  [NATIONAL_TEAMS_LEAGUE_LABEL]: "🌍",
  [CUSTOM_CLUBS_LEAGUE_LABEL]: "⭐",
};

export function getLeagueIcon(league: string): string {
  return LEAGUE_ICONS[league] ?? "⚽";
}

function leagueSortRank(league: string): number {
  if (league === CUSTOM_CLUBS_LEAGUE_LABEL) return KNOWN_LEAGUE_ORDER.length + 1;
  const known = KNOWN_LEAGUE_ORDER.indexOf(league);
  return known === -1 ? KNOWN_LEAGUE_ORDER.length : known;
}

export interface LeagueGroup {
  league: string;
  clubVersions: ClubVersion[];
}

/**
 * Groups club versions by their club's league (custom clubs -- group_id
 * set -- are always bucketed under "Custom Clubs" regardless of any league
 * value they were given), in the picker's league-first display order.
 * Clubs with no league at all are grouped under "Custom Clubs" too, so a
 * club never silently disappears from every league list.
 */
export function groupClubVersionsByLeague(clubVersions: readonly ClubVersion[]): LeagueGroup[] {
  const byLeague = new Map<string, ClubVersion[]>();

  for (const cv of clubVersions) {
    const league = cv.club.group_id !== null ? CUSTOM_CLUBS_LEAGUE_LABEL : (cv.club.league ?? CUSTOM_CLUBS_LEAGUE_LABEL);
    const bucket = byLeague.get(league) ?? [];
    bucket.push(cv);
    byLeague.set(league, bucket);
  }

  return [...byLeague.entries()]
    .map(([league, clubVersionsInLeague]) => ({ league, clubVersions: clubVersionsInLeague }))
    .sort((a, b) => leagueSortRank(a.league) - leagueSortRank(b.league) || a.league.localeCompare(b.league));
}

/** Case-insensitive substring search over a club version list's names -- used only within an already-selected league, never across the whole database. */
export function searchClubVersions(clubVersions: readonly ClubVersion[], query: string): ClubVersion[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...clubVersions];
  return clubVersions.filter((cv) => cv.club.name.toLowerCase().includes(q));
}

/** True for any club version whose effective league is "National Teams" (custom clubs are never national teams, regardless of what league string they were given). */
export function isNationalTeamClubVersion(clubVersion: ClubVersion): boolean {
  return clubVersion.club.group_id === null && clubVersion.club.league === NATIONAL_TEAMS_LEAGUE_LABEL;
}

/** Drops national-team club versions when `includeNationalTeams` is false -- the single choke point "All Clubs" search, random generation, and league grouping all go through so the Include/Exclude National Teams preference is honored everywhere at once. */
export function applyNationalTeamsPreference(clubVersions: readonly ClubVersion[], includeNationalTeams: boolean): ClubVersion[] {
  if (includeNationalTeams) return [...clubVersions];
  return clubVersions.filter((cv) => !isNationalTeamClubVersion(cv));
}

/**
 * Case-insensitive substring search across the *entire* club pool (every
 * league at once) -- backs "All Clubs" mode, unlike searchClubVersions
 * which is deliberately scoped to one already-selected league. Custom
 * clubs and national teams are each optionally excluded before searching.
 */
export function searchAllClubVersions(
  clubVersions: readonly ClubVersion[],
  query: string,
  options: { includeCustom?: boolean; includeNationalTeams?: boolean } = {},
): ClubVersion[] {
  const { includeCustom = true, includeNationalTeams = true } = options;
  let pool = [...clubVersions];
  if (!includeCustom) pool = pool.filter((cv) => cv.club.group_id === null);
  pool = applyNationalTeamsPreference(pool, includeNationalTeams);
  return searchClubVersions(pool, query);
}

/** Stable partition -- favorited clubs first (in their existing relative order), then the rest (also in their existing relative order). */
export function sortClubVersionsFavoritesFirst(clubVersions: readonly ClubVersion[], favoriteClubIds: readonly string[]): ClubVersion[] {
  const favorites = new Set(favoriteClubIds);
  const favored: ClubVersion[] = [];
  const rest: ClubVersion[] = [];
  for (const cv of clubVersions) {
    (favorites.has(cv.club_id) ? favored : rest).push(cv);
  }
  return [...favored, ...rest];
}

export interface RandomGenerationFilters {
  /** Restrict to one exact star rating (e.g. 4.5). */
  sameStarRating?: number | null;
  /** Restrict to an inclusive star-rating range, e.g. { min: 3, max: 4.5 }. */
  starRatingRange?: { min: number; max: number } | null;
  /** Restrict to one league (as it appears on the club, or CUSTOM_CLUBS_LEAGUE_LABEL). */
  sameLeague?: string | null;
  /** Restrict to any of several leagues at once (a multi-select alternative to sameLeague). */
  selectedLeagues?: readonly string[] | null;
  /** Default true -- set false to exclude custom (group-owned) clubs entirely. */
  includeCustom?: boolean;
  /** Default true -- set false to exclude national-team clubs entirely (respects the group's Include/Exclude National Teams preference). */
  includeNationalTeams?: boolean;
  /** Club ids to exclude, e.g. the caller's own favorites or recently-used list. */
  excludeClubIds?: readonly string[];
}

/**
 * Narrows a club-version pool before handing it to the existing random
 * team/club generator (src/lib/random/clubs.ts) -- this only filters which
 * clubs are eligible; the actual assignment algorithms are unchanged and
 * still receive a plain ClubVersion[] pool.
 */
/** How many recently-used club ids to remember, per the "last 6-10 clubs" request. */
export const MAX_RECENTLY_USED_CLUBS = 8;

/** Moves `clubId` to the front of the recently-used list (most recent first), de-duplicating and capping at MAX_RECENTLY_USED_CLUBS. */
export function recordClubUsage(recentIds: readonly string[], clubId: string): string[] {
  return [clubId, ...recentIds.filter((id) => id !== clubId)].slice(0, MAX_RECENTLY_USED_CLUBS);
}

export function filterClubVersionsForRandomGeneration(clubVersions: readonly ClubVersion[], filters: RandomGenerationFilters): ClubVersion[] {
  const {
    sameStarRating,
    starRatingRange,
    sameLeague,
    selectedLeagues,
    includeCustom = true,
    includeNationalTeams = true,
    excludeClubIds = [],
  } = filters;
  const excluded = new Set(excludeClubIds);

  return clubVersions.filter((cv) => {
    if (!includeCustom && cv.club.group_id !== null) return false;
    if (!includeNationalTeams && isNationalTeamClubVersion(cv)) return false;
    if (sameStarRating != null && cv.star_rating !== sameStarRating) return false;
    if (starRatingRange != null && (cv.star_rating < starRatingRange.min || cv.star_rating > starRatingRange.max)) return false;
    const effectiveLeague = cv.club.group_id !== null ? CUSTOM_CLUBS_LEAGUE_LABEL : (cv.club.league ?? CUSTOM_CLUBS_LEAGUE_LABEL);
    if (sameLeague != null && effectiveLeague !== sameLeague) return false;
    if (selectedLeagues != null && selectedLeagues.length > 0 && !selectedLeagues.includes(effectiveLeague)) return false;
    if (excluded.has(cv.club_id)) return false;
    return true;
  });
}

export interface ClubDatabaseValidationIssue {
  clubId: string;
  clubName: string;
  reason: "duplicate_name" | "missing_league" | "missing_country" | "invalid_star_rating" | "star_rating_not_half_increment";
}

/**
 * Pure audit of the built-in (non-custom) club catalog -- duplicate
 * normalized names, missing league/country, and out-of-range or non-half-
 * star ratings. Custom clubs are exempt from missing-league/country checks
 * (those fields are genuinely optional for a manually-created club, per the
 * "only name is required" rule) but are still checked for valid ratings and
 * name collisions against the whole catalog.
 */
export function validateBuiltInClubDatabase(clubVersions: readonly ClubVersion[]): ClubDatabaseValidationIssue[] {
  const issues: ClubDatabaseValidationIssue[] = [];
  const seenNormalizedNames = new Map<string, string>();

  for (const cv of clubVersions) {
    const { club } = cv;
    const normalized = normalizeClubName(club.name);
    const firstSeenId = seenNormalizedNames.get(normalized);
    if (firstSeenId && firstSeenId !== club.id) {
      issues.push({ clubId: club.id, clubName: club.name, reason: "duplicate_name" });
    } else {
      seenNormalizedNames.set(normalized, club.id);
    }

    const isBuiltIn = club.group_id === null;
    if (isBuiltIn && !club.league) {
      issues.push({ clubId: club.id, clubName: club.name, reason: "missing_league" });
    }
    if (isBuiltIn && !club.country) {
      issues.push({ clubId: club.id, clubName: club.name, reason: "missing_country" });
    }

    if (typeof cv.star_rating !== "number" || Number.isNaN(cv.star_rating) || cv.star_rating < 0.5 || cv.star_rating > 5) {
      issues.push({ clubId: club.id, clubName: club.name, reason: "invalid_star_rating" });
    } else if (Math.round(cv.star_rating * 2) !== cv.star_rating * 2) {
      issues.push({ clubId: club.id, clubName: club.name, reason: "star_rating_not_half_increment" });
    }
  }

  return issues;
}
