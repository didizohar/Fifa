import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export const playerKeys = {
  list: (groupId: string) => ["players", groupId] as const,
  detail: (playerId: string) => ["players", "detail", playerId] as const,
};

export const matchKeys = {
  list: (groupId: string) => ["matches", groupId] as const,
  detail: (matchId: string) => ["matches", "detail", matchId] as const,
  stats: (groupId: string) => ["matches", "stats", groupId] as const,
  records: (playerIds: string[]) => ["matches", "records", ...playerIds] as const,
  history: (playerIds: string[]) => ["matches", "history", ...playerIds] as const,
  groupHistory: (groupId: string) => ["matches", "groupHistory", groupId] as const,
};

export const groupKeys = {
  mine: (userId: string | undefined) => ["groups", "mine", userId] as const,
};

export const clubKeys = {
  versions: (gameVersionId: string) => ["clubVersions", gameVersionId] as const,
  gameVersions: ["gameVersions"] as const,
};

export const seasonKeys = {
  list: (groupId: string) => ["seasons", groupId] as const,
  matchCount: (seasonId: string) => ["seasons", "matchCount", seasonId] as const,
};

/**
 * Every query key a match edit can affect, as prefixes rather than
 * fully-specified keys -- react-query's invalidateQueries treats a given
 * key as a prefix match by default, so `["matches", "records"]` catches
 * every records query regardless of which specific player ids it was
 * fetched with. This deliberately doesn't try to compute which players
 * were added/removed from the match: any player who was ever on either
 * side (before or after the edit) needs their per-player queries
 * refreshed, and prefix-invalidating all of them is simpler and just as
 * correct as tracking the diff.
 */
export function determineAffectedQueries(groupId: string, matchId: string): readonly (readonly unknown[])[] {
  return [
    playerKeys.list(groupId),
    matchKeys.list(groupId),
    matchKeys.groupHistory(groupId),
    matchKeys.stats(groupId),
    matchKeys.detail(matchId),
    ["matches", "records"],
    ["matches", "history"],
  ];
}
