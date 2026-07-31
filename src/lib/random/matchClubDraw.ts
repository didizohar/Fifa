import { defaultRNG, type RNG } from "./rng";
import { assignBalancedClubs, assignRandomClubs, filterClubsByExactStars, filterValidClubVersions } from "./clubs";

interface StarRatedClub {
  id: string;
  star_rating: number;
}

export type ClubDrawStarMode = "sameStar" | "similarStrength" | "anyStrength";

export interface DrawClubsForMatchParams<T extends StarRatedClub> {
  clubs: readonly T[];
  starMode: ClubDrawStarMode;
  /** Required only for "sameStar" -- the exact star rating both clubs must share. Ignored otherwise. */
  selectedStarLevel?: number | null;
  /** Default false (the historical behavior) -- true lets both pairs draw the same club instead of always forcing two distinct ones. Reuses assignRandomClubs' existing with-replacement handling, same as the standalone Random Club Generator. */
  allowDuplicates?: boolean;
  randomFn?: RNG;
}

export interface DrawClubsForMatchResult<T> {
  clubA: T;
  clubB: T;
  starDifference: number;
  selectionMode: ClubDrawStarMode;
}

export type DrawClubsForMatchOutcome<T> = { ok: true; result: DrawClubsForMatchResult<T> } | { ok: false; reason: "notEnoughClubs" };

/**
 * Thin adapter over the existing Club Draw engine (random/clubs.ts) for
 * assigning clubs to Winners Stay's two pairs -- no separate club database,
 * filtering, or star-rating logic of its own. `params.clubs` is expected to
 * already be filtered by the caller through the same
 * filterClubVersionsForRandomGeneration engine the standalone Random Club
 * Generator and Club Picker use (national teams / custom clubs / etc.) --
 * this function only ever picks star-rated clubs, never re-derives which
 * clubs are eligible in the first place. Three modes:
 *
 *   - "sameStar": both clubs must share selectedStarLevel exactly --
 *     assignRandomClubs over that level's pool.
 *   - "similarStrength": reuses assignBalancedClubs' tightest-star-spread
 *     window over the WHOLE valid pool -- this already prefers an exact
 *     match (spread 0) when one exists and falls back to the nearest pair
 *     otherwise, which is exactly "prefer same rating, else nearest,
 *     avoid a big gap" without any new logic.
 *   - "anyStrength": assignRandomClubs over the whole valid pool.
 *
 * `allowDuplicates` (default false) is passed straight through to
 * assignRandomClubs/assignBalancedClubs, same "Prevent Duplicate Clubs"
 * semantics as the standalone Random Club Generator.
 *
 * Returns `{ ok: false }` (never throws, never silently duplicates when
 * duplicates aren't allowed) when there aren't enough eligible clubs for
 * the requested mode.
 */
export function drawClubsForMatch<T extends StarRatedClub>(params: DrawClubsForMatchParams<T>): DrawClubsForMatchOutcome<T> {
  const rng = params.randomFn ?? defaultRNG;
  const allowDuplicates = params.allowDuplicates ?? false;
  const validPool = filterValidClubVersions(params.clubs);

  let assignments: T[];

  if (params.starMode === "sameStar") {
    if (params.selectedStarLevel == null) return { ok: false, reason: "notEnoughClubs" };
    const pool = filterClubsByExactStars(validPool, params.selectedStarLevel);
    if (pool.length < 2 && !allowDuplicates) return { ok: false, reason: "notEnoughClubs" };
    if (pool.length === 0) return { ok: false, reason: "notEnoughClubs" };
    assignments = assignRandomClubs(pool, 2, { rng, allowDuplicates }).assignments;
  } else if (params.starMode === "similarStrength") {
    if (validPool.length < 2) return { ok: false, reason: "notEnoughClubs" };
    assignments = assignBalancedClubs(validPool, 2, { rng, allowDuplicates }).assignments;
  } else {
    if (validPool.length < 2 && !allowDuplicates) return { ok: false, reason: "notEnoughClubs" };
    if (validPool.length === 0) return { ok: false, reason: "notEnoughClubs" };
    assignments = assignRandomClubs(validPool, 2, { rng, allowDuplicates }).assignments;
  }

  const [clubA, clubB] = assignments as [T, T];
  return { ok: true, result: { clubA, clubB, starDifference: Math.abs(clubA.star_rating - clubB.star_rating), selectionMode: params.starMode } };
}
