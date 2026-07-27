import { assignBalancedClubs, assignHandicapClubs, assignRandomClubs } from "./clubs";
import { averageDrawLevel } from "./drawLevel";
import { type RNG, defaultRNG, sample } from "./rng";
import { splitIntoTeams } from "./teams";

interface Identifiable {
  id: string;
}

interface StarRatedClub {
  id: string;
  star_rating: number;
}

export type MatchupClubMode = "random" | "balanced" | "handicap";

export interface FullMatchupResult<P, C> {
  sides: [P[], P[]];
  /** null when the club pool was empty -- players/sides are still valid, there's just no club to show yet. */
  clubs: [C, C] | null;
  /** True when the two sides ended up with the same club -- only possible when duplicates were allowed or the pool was too small to avoid it. */
  usedDuplicateClub: boolean;
}

/** Splits a drawn player list into two sides in a fixed, non-randomized order (first half / second half). */
export function chunkIntoSides<T>(items: readonly T[]): [T[], T[]] {
  const half = Math.ceil(items.length / 2);
  return [items.slice(0, half), items.slice(half)];
}

/**
 * Generates a complete matchup in one pass: draws the required number of
 * players from the eligible pool, splits them into two sides, and (if a
 * club pool is available) assigns one club per side. The whole result is
 * computed from a single injected RNG so it's deterministic end-to-end --
 * this is the "combined flow" step of Full Matchup Draw; per-item redraws
 * and locks after the initial draw are handled by the screen itself.
 */
export function generateFullMatchup<P extends Identifiable, C extends StarRatedClub>(options: {
  eligiblePlayers: readonly P[];
  requiredPlayers: number;
  randomizeSides: boolean;
  clubPool: readonly C[];
  clubMode: MatchupClubMode;
  allowDuplicates?: boolean;
  getDrawLevel?: (player: P) => number;
  rng?: RNG;
}): FullMatchupResult<P, C> | null {
  const { eligiblePlayers, requiredPlayers, randomizeSides, clubPool, clubMode, allowDuplicates = false, getDrawLevel, rng = defaultRNG } = options;
  if (eligiblePlayers.length < requiredPlayers) return null;

  const drawn = sample(eligiblePlayers, requiredPlayers, rng);
  const sides: [P[], P[]] = randomizeSides
    ? (() => {
        const split = splitIntoTeams(drawn, 2, { rng });
        return [split[0], split[1]];
      })()
    : chunkIntoSides(drawn);

  if (clubPool.length === 0) return { sides, clubs: null, usedDuplicateClub: false };

  let assignedClubs: C[];
  if (clubMode === "handicap") {
    // assignHandicapClubs returns results ordered by draw level, not input order -- map back by id to preserve side 0 / side 1.
    const entries = sides.map((side, i) => ({ participant: { id: `side${i}` }, drawLevel: averageDrawLevel(side, (p) => getDrawLevel?.(p) ?? null) }));
    const byId = new Map(assignHandicapClubs(entries, clubPool, { rng, allowDuplicates }).map((r) => [r.participant.id, r.club]));
    assignedClubs = entries.map((entry) => byId.get(entry.participant.id)!);
  } else if (clubMode === "balanced") {
    assignedClubs = assignBalancedClubs(clubPool, 2, { rng, allowDuplicates }).assignments;
  } else {
    assignedClubs = assignRandomClubs(clubPool, 2, { rng, allowDuplicates }).assignments;
  }

  const usedDuplicateClub = assignedClubs.length === 2 && assignedClubs[0].id === assignedClubs[1].id;
  return { sides, clubs: assignedClubs.length === 2 ? [assignedClubs[0], assignedClubs[1]] : null, usedDuplicateClub };
}
