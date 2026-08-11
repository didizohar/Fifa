import { useMutation, useQueryClient } from "@tanstack/react-query";
import { recordMatchAndAdvanceSession, type RecordMatchAndAdvanceSessionArgs } from "../lib/activeSessions";
import { matchKeys, playerKeys } from "../lib/queryClient";

/**
 * The concurrency-safe counterpart to useRecordMatch, for the two entry
 * points that record a match against a shared Winners Stay session
 * (QuickMatchCard, record-match.tsx's winnersStay-linked create path) --
 * see recordMatchAndAdvanceSession for what makes this atomic. Same cache
 * invalidation as useRecordMatch, but only on a genuine success: a
 * `{ok: "stale"}`/`{ok: "no_session"}` result means nothing was actually
 * written, so there's nothing stale to invalidate.
 */
export function useRecordMatchAndAdvanceSession(groupId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: RecordMatchAndAdvanceSessionArgs) => recordMatchAndAdvanceSession(args),
    onSuccess: (result) => {
      if (!groupId || result.ok !== true) return;
      queryClient.invalidateQueries({ queryKey: playerKeys.list(groupId) });
      queryClient.invalidateQueries({ queryKey: matchKeys.list(groupId) });
      queryClient.invalidateQueries({ queryKey: matchKeys.groupHistory(groupId) });
      queryClient.invalidateQueries({ queryKey: ["matches", "records"] });
    },
  });
}
