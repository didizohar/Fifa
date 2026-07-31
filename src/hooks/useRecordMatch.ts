import { useMutation, useQueryClient } from "@tanstack/react-query";
import { processMatch } from "../lib/matchService";
import { matchKeys, playerKeys } from "../lib/queryClient";
import type { RecordMatchPayload } from "../lib/types/database";

export function useRecordMatch(groupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RecordMatchPayload) => processMatch(payload),
    onSuccess: () => {
      if (!groupId) return;
      queryClient.invalidateQueries({ queryKey: playerKeys.list(groupId) });
      queryClient.invalidateQueries({ queryKey: matchKeys.list(groupId) });
      // groupHistory backs Home's League Table card, the full League Table
      // screen, and League Management's counts -- without this, all of them
      // kept showing pre-match data until their own unrelated staleTime
      // elapsed. useEditMatch already invalidates this (via
      // determineAffectedQueries); recording a brand new match was the one
      // path that didn't.
      queryClient.invalidateQueries({ queryKey: matchKeys.groupHistory(groupId) });
      queryClient.invalidateQueries({ queryKey: ["matches", "records"] });
    },
  });
}
