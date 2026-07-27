import { type RNG, defaultRNG, shuffle } from "./rng";

interface Identifiable {
  id: string;
}

interface TeamDistributionOptions {
  rng?: RNG;
  /** Maps a player id to the team index they're locked into; those players skip shuffling. */
  locked?: Map<string, number>;
}

function partitionLocked<T extends Identifiable>(
  players: readonly T[],
  teamCount: number,
  locked: Map<string, number>,
): { teams: T[][]; unlocked: T[] } {
  const teams: T[][] = Array.from({ length: teamCount }, () => []);
  const unlocked: T[] = [];
  for (const player of players) {
    const lockedTeam = locked.get(player.id);
    if (lockedTeam !== undefined && lockedTeam >= 0 && lockedTeam < teamCount) {
      teams[lockedTeam].push(player);
    } else {
      unlocked.push(player);
    }
  }
  return { teams, unlocked };
}

/**
 * Splits players into `teamCount` teams as evenly as possible, filling the
 * currently-smallest team first so an uneven player count spreads out
 * rather than piling extras onto one side.
 */
export function splitIntoTeams<T extends Identifiable>(
  players: readonly T[],
  teamCount: number,
  options: TeamDistributionOptions = {},
): T[][] {
  const count = Math.max(1, teamCount);
  const { teams, unlocked } = partitionLocked(players, count, options.locked ?? new Map());

  for (const player of shuffle(unlocked, options.rng ?? defaultRNG)) {
    let smallest = 0;
    for (let i = 1; i < count; i++) {
      if (teams[i].length < teams[smallest].length) smallest = i;
    }
    teams[smallest].push(player);
  }

  return teams;
}

/**
 * Splits players into `teamCount` teams, greedily assigning the
 * highest-rated remaining player to the currently-lowest-rated team so the
 * total rating per team stays as close as possible. Players are shuffled
 * before sorting so ties (including an all-equal-rating group) are broken
 * randomly rather than by input order -- this is what lets a redraw produce
 * a different, still-balanced outcome.
 */
export function splitIntoBalancedTeams<T extends Identifiable>(
  players: readonly T[],
  teamCount: number,
  getRating: (player: T) => number,
  options: TeamDistributionOptions = {},
): T[][] {
  const count = Math.max(1, teamCount);
  const { teams, unlocked } = partitionLocked(players, count, options.locked ?? new Map());
  const totals = teams.map((team) => team.reduce((sum, player) => sum + getRating(player), 0));

  const randomized = shuffle(unlocked, options.rng ?? defaultRNG);
  const sorted = randomized
    .map((player, index) => ({ player, rating: getRating(player), index }))
    .sort((a, b) => b.rating - a.rating || a.index - b.index);

  for (const { player, rating } of sorted) {
    let lowest = 0;
    for (let i = 1; i < count; i++) {
      if (totals[i] < totals[lowest]) lowest = i;
    }
    teams[lowest].push(player);
    totals[lowest] += rating;
  }

  return teams;
}

/** Moves one player from one team to another after a draw. A no-op (returns a shallow copy) if the player or either team index isn't found. */
export function movePlayerBetweenTeams<T extends Identifiable>(
  teams: readonly (readonly T[])[],
  playerId: string,
  fromTeam: number,
  toTeam: number,
): T[][] {
  const next = teams.map((team) => [...team]);
  if (fromTeam < 0 || fromTeam >= next.length || toTeam < 0 || toTeam >= next.length) return next;

  const idx = next[fromTeam].findIndex((player) => player.id === playerId);
  if (idx === -1) return next;

  const [player] = next[fromTeam].splice(idx, 1);
  next[toTeam].push(player);
  return next;
}
