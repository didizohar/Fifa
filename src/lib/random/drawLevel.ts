/** Fallback used whenever a player has no manually-configured Draw Level -- treated as exactly average, never as a penalty or an exclusion. */
export const DRAW_LEVEL_DEFAULT = 3;

export function resolveDrawLevel(drawLevel: number | null | undefined): number {
  return drawLevel ?? DRAW_LEVEL_DEFAULT;
}

/** Average draw level for a group of players (e.g. one side of a matchup), defaulting missing values individually rather than excluding those players. */
export function averageDrawLevel<T>(players: readonly T[], getDrawLevel: (player: T) => number | null): number {
  if (players.length === 0) return DRAW_LEVEL_DEFAULT;
  return players.reduce((sum, player) => sum + resolveDrawLevel(getDrawLevel(player)), 0) / players.length;
}
