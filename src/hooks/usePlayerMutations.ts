import { useMutation, useQueryClient } from "@tanstack/react-query";
import { archivePlayer, createPlayer, CreatePlayerInput, updatePlayer, UpdatePlayerInput } from "../lib/players";
import { playerKeys } from "../lib/queryClient";

export function useCreatePlayer(groupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlayerInput) => createPlayer(input),
    onSuccess: () => {
      if (groupId) queryClient.invalidateQueries({ queryKey: playerKeys.list(groupId) });
    },
  });
}

export function useUpdatePlayer(groupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ playerId, patch }: { playerId: string; patch: UpdatePlayerInput }) =>
      updatePlayer(playerId, patch),
    onSuccess: (_data, variables) => {
      if (groupId) queryClient.invalidateQueries({ queryKey: playerKeys.list(groupId) });
      queryClient.invalidateQueries({ queryKey: playerKeys.detail(variables.playerId) });
    },
  });
}

export function useArchivePlayer(groupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (playerId: string) => archivePlayer(playerId),
    onSuccess: (_data, playerId) => {
      if (groupId) queryClient.invalidateQueries({ queryKey: playerKeys.list(groupId) });
      queryClient.invalidateQueries({ queryKey: playerKeys.detail(playerId) });
    },
  });
}
