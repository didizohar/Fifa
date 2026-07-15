import { useQuery } from "@tanstack/react-query";
import { fetchPlayer, fetchPlayers } from "../lib/players";
import { playerKeys } from "../lib/queryClient";

export function usePlayers(groupId: string | null, includeArchived = false) {
  return useQuery({
    queryKey: [...playerKeys.list(groupId ?? ""), { includeArchived }],
    queryFn: () => fetchPlayers(groupId!, includeArchived),
    enabled: !!groupId,
  });
}

export function usePlayer(playerId: string | undefined) {
  return useQuery({
    queryKey: playerKeys.detail(playerId ?? ""),
    queryFn: () => fetchPlayer(playerId!),
    enabled: !!playerId,
  });
}
