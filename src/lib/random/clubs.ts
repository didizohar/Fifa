import { type RNG, defaultRNG, sample, shuffle } from "./rng";

interface StarRatedClub {
  id: string;
  star_rating: number;
}

export interface ClubAssignmentResult<T> {
  assignments: T[];
  /** True when at least one club had to be reused because there weren't enough unique clubs, or duplicates were explicitly allowed and occurred. */
  usedDuplicates: boolean;
}

export function filterClubsByExactStars<T extends StarRatedClub>(clubs: readonly T[], stars: number): T[] {
  return clubs.filter((club) => club.star_rating === stars);
}

export function filterClubsByStarRange<T extends StarRatedClub>(clubs: readonly T[], min: number, max: number): T[] {
  return clubs.filter((club) => club.star_rating >= min && club.star_rating <= max);
}

/** Drops any club version with a missing/non-numeric star rating before it ever reaches a draw pool, so a data gap can't crash a filter or assignment downstream. */
export function filterValidClubVersions<T extends { star_rating: number | null | undefined }>(clubVersions: readonly T[]): T[] {
  return clubVersions.filter((cv) => typeof cv.star_rating === "number");
}

function hasDuplicates<T extends StarRatedClub>(assignments: readonly T[]): boolean {
  return new Set(assignments.map((club) => club.id)).size < assignments.length;
}

/** Assigns one club per participant, avoiding repeats when there are enough unique clubs to do so. */
export function assignRandomClubs<T extends StarRatedClub>(
  clubs: readonly T[],
  participantCount: number,
  options: { rng?: RNG; allowDuplicates?: boolean } = {},
): ClubAssignmentResult<T> {
  if (clubs.length === 0 || participantCount <= 0) return { assignments: [], usedDuplicates: false };
  const rng = options.rng ?? defaultRNG;
  const allowDuplicates = options.allowDuplicates ?? false;

  const assignments =
    !allowDuplicates && clubs.length >= participantCount
      ? sample(clubs, participantCount, rng)
      : Array.from({ length: participantCount }, () => clubs[Math.floor(rng() * clubs.length)]);

  return { assignments, usedDuplicates: hasDuplicates(assignments) };
}

/**
 * Assigns one club per participant from the tightest-star-spread window of
 * the pool, so every participant's club is as close in rating as possible.
 * Ties between equally-tight windows (and the order within the chosen
 * window) are broken randomly so a redraw can still change the outcome.
 */
export function assignBalancedClubs<T extends StarRatedClub>(
  clubs: readonly T[],
  participantCount: number,
  options: { rng?: RNG; allowDuplicates?: boolean } = {},
): ClubAssignmentResult<T> {
  if (clubs.length === 0 || participantCount <= 0) return { assignments: [], usedDuplicates: false };
  const rng = options.rng ?? defaultRNG;
  const allowDuplicates = options.allowDuplicates ?? false;

  if (!allowDuplicates && clubs.length < participantCount) {
    return assignRandomClubs(clubs, participantCount, { rng, allowDuplicates: true });
  }

  const sorted = [...clubs].sort((a, b) => a.star_rating - b.star_rating);
  let bestSpread = Infinity;
  let bestStarts: number[] = [];
  for (let start = 0; start + participantCount <= sorted.length; start++) {
    const spread = sorted[start + participantCount - 1].star_rating - sorted[start].star_rating;
    if (spread < bestSpread - 1e-9) {
      bestSpread = spread;
      bestStarts = [start];
    } else if (Math.abs(spread - bestSpread) < 1e-9) {
      bestStarts.push(start);
    }
  }

  const chosenStart = bestStarts[Math.floor(rng() * bestStarts.length)];
  const window = sorted.slice(chosenStart, chosenStart + participantCount);
  const assignments = shuffle(window, rng);
  return { assignments, usedDuplicates: hasDuplicates(assignments) };
}

export interface HandicapAssignment<P, C> {
  participant: P;
  club: C;
  drawLevel: number;
}

/**
 * Pairs the highest configured Draw Level with the weakest available club
 * and vice versa, using only the caller-supplied `drawLevel` (never Elo or
 * any hidden ranking). Ties in draw level are broken randomly.
 */
export function assignHandicapClubs<P extends { id: string }, C extends StarRatedClub>(
  participants: readonly { participant: P; drawLevel: number }[],
  clubs: readonly C[],
  options: { rng?: RNG; allowDuplicates?: boolean } = {},
): HandicapAssignment<P, C>[] {
  if (participants.length === 0 || clubs.length === 0) return [];
  const rng = options.rng ?? defaultRNG;
  const allowDuplicates = options.allowDuplicates ?? false;
  const useReplacement = allowDuplicates || clubs.length < participants.length;

  const rankedParticipants = shuffle(participants, rng)
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.drawLevel - a.drawLevel || a.index - b.index);

  const clubPool = useReplacement ? clubs : sample(clubs, participants.length, rng);
  const rankedClubs = [...clubPool].sort((a, b) => a.star_rating - b.star_rating);

  return rankedParticipants.map((entry, i) => ({
    participant: entry.participant,
    drawLevel: entry.drawLevel,
    club: rankedClubs[useReplacement ? i % rankedClubs.length : i],
  }));
}
