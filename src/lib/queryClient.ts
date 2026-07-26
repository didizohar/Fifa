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
};
