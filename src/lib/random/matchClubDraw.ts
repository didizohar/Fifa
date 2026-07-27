import { defaultRNG, sample, type RNG } from "./rng";
import { assignBalancedClubs, filterClubsByExactStars, filterValidClubVersions } from "./clubs";

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
 * assigning two DIFFERENT clubs to Winners Stay's two pairs -- no separate
 * club database or star-rating logic, just this stage's three modes:
 *
 *   - "sameStar": both clubs must share selectedStarLevel exactly (a plain
 *     unique sample() from that level's pool).
 *   - "similarStrength": reuses assignBalancedClubs' tightest-star-spread
 *     window over the WHOLE valid pool -- this already prefers an exact
 *     match (spread 0) when one exists and falls back to the nearest pair
 *     otherwise, which is exactly "prefer same rating, else nearest,
 *     avoid a big gap" without any new logic.
 *   - "anyStrength": a plain unique sample() from the whole valid pool.
 *
 * Returns `{ ok: false }` (never throws, never silently duplicates) when
 * there aren't at least two eligible clubs for the requested mode.
 */
export function drawClubsForMatch<T extends StarRatedClub>(params: DrawClubsForMatchParams<T>): DrawClubsForMatchOutcome<T> {
  const rng = params.randomFn ?? defaultRNG;
  const validPool = filterValidClubVersions(params.clubs);

  let assignments: T[];

  if (params.starMode === "sameStar") {
    if (params.selectedStarLevel == null) return { ok: false, reason: "notEnoughClubs" };
    const pool = filterClubsByExactStars(validPool, params.selectedStarLevel);
    if (pool.length < 2) return { ok: false, reason: "notEnoughClubs" };
    assignments = sample(pool, 2, rng);
  } else if (params.starMode === "similarStrength") {
    if (validPool.length < 2) return { ok: false, reason: "notEnoughClubs" };
    assignments = assignBalancedClubs(validPool, 2, { rng }).assignments;
  } else {
    if (validPool.length < 2) return { ok: false, reason: "notEnoughClubs" };
    assignments = sample(validPool, 2, rng);
  }

  const [clubA, clubB] = assignments as [T, T];
  return { ok: true, result: { clubA, clubB, starDifference: Math.abs(clubA.star_rating - clubB.star_rating), selectionMode: params.starMode } };
}
