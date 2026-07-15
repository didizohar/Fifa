import { useMutation, useQueryClient } from "@tanstack/react-query";
import { processMatchAndElo } from "../lib/matchService";
import { matchKeys, playerKeys } from "../lib/queryClient";
import type { RecordMatchPayload } from "../lib/types/database";

export function useRecordMatch(groupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RecordMatchPayload) => processMatchAndElo(payload),
    onSuccess: () => {
      if (!groupId) return;
      queryClient.invalidateQueries({ queryKey: playerKeys.list(groupId) });
      queryClient.invalidateQueries({ queryKey: matchKeys.list(groupId) });
    },
  });
}
