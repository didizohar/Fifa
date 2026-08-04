import { useMutation, useQueryClient } from "@tanstack/react-query";
import { processMatchEdit } from "../lib/matchService";
import { determineAffectedQueries } from "../lib/queryClient";
import { clearAllCachedSeasonReports } from "./useSeasonReport";
import type { EditMatchPayload } from "../lib/types/database";

export function useEditMatch(groupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: EditMatchPayload) => processMatchEdit(payload),
    onSuccess: (_matchId, payload) => {
      // Not react-query-backed, so invalidateQueries below can't reach it --
      // see clearAllCachedSeasonReports's docstring for why.
      clearAllCachedSeasonReports();
      if (!groupId) return;
      for (const queryKey of determineAffectedQueries(groupId, payload.matchId)) {
        queryClient.invalidateQueries({ queryKey: queryKey as unknown[] });
      }
    },
  });
}
