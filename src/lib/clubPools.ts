import { filterClubsByStarRange } from "./random/clubs";

export type ClubPoolMode = "large" | "small" | "random";

interface StarRatedClub {
  id: string;
  star_rating: number;
}

/** The two star-rating bands the simplified Club Draw pickers (Dashboard, Record Match) offer instead of a per-level selector. "random" is intentionally not a range -- it means no star filtering at all. */
const POOL_RANGE: Record<Exclude<ClubPoolMode, "random">, { min: number; max: number }> = {
  large: { min: 4.5, max: 5 },
  small: { min: 3.5, max: 4 },
};

/**
 * Narrows a valid club pool to the given mode's star-rating band, reusing
 * filterClubsByStarRange (the same range filter the standalone Random Club
 * Generator's "Star Range" mode already uses) rather than introducing a
 * second, parallel filtering implementation. "random" returns the pool
 * unfiltered -- callers still run it through their normal draw function
 * (e.g. drawClubsForMatch with starMode "anyStrength"), so no new
 * assignment/duplicate-prevention logic is needed either.
 */
export function filterClubsByPool<T extends StarRatedClub>(clubs: readonly T[], mode: ClubPoolMode): T[] {
  if (mode === "random") return [...clubs];
  const { min, max } = POOL_RANGE[mode];
  return filterClubsByStarRange(clubs, min, max);
}
