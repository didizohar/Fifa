import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearGroupLocalData, deleteGroup } from "../lib/groups";
import { groupKeys } from "../lib/queryClient";

/**
 * Permanently deletes a group. onSuccess order matters: local/cache
 * cleanup happens before the groups-list invalidation is awaited, so by
 * the time this mutation resolves, GroupProvider's own existing
 * stale-currentGroupId fallback (and, if that was the user's only group,
 * RootNavigator's existing "no groups -> onboarding" Stack.Protected
 * guard) have everything they need to react correctly -- no new
 * navigation logic needed here, same as how signOut() already works.
 *
 * TanStack Query runs `onSuccess` inside the SAME try/catch as the
 * mutation itself (confirmed against @tanstack/query-core's Mutation#
 * execute()) -- if it throws, the whole mutation is reported as failed
 * to the caller via mutateAsync(), even though deleteGroup() above
 * already succeeded and the group is permanently gone server-side. A
 * transient failure in any of this best-effort cache/local cleanup
 * (e.g. the awaited invalidateQueries refetch hitting a network blip)
 * would therefore surface as "couldn't delete the group" to the user
 * while it actually had already been deleted -- and a retry would then
 * fail for a completely different reason ("group not found"), which is
 * exactly the confusing "doesn't work" symptom this fixes. Wrapped so a
 * cleanup failure can, at worst, leave some stale cache behind, never
 * mask a real, already-successful deletion.
 */
export function useDeleteGroup(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, confirmName }: { groupId: string; confirmName: string }) => {
      await deleteGroup(groupId, confirmName);
      return groupId;
    },
    onSuccess: async (groupId) => {
      // Each step guarded independently -- e.g. a clearGroupLocalData
      // (AsyncStorage) failure must not prevent invalidateQueries from
      // even being attempted, since that's the step that actually makes
      // the deleted group disappear from every list/guard in the app.
      try {
        queryClient.removeQueries({ predicate: (query) => query.queryKey.includes(groupId) });
      } catch (e) {
        if (__DEV__) console.warn("Delete Group: removeQueries failed (group was still deleted)", e);
      }
      try {
        await clearGroupLocalData(groupId);
      } catch (e) {
        if (__DEV__) console.warn("Delete Group: clearGroupLocalData failed (group was still deleted)", e);
      }
      try {
        await queryClient.invalidateQueries({ queryKey: groupKeys.mine(userId) });
      } catch (e) {
        if (__DEV__) console.warn("Delete Group: invalidateQueries failed (group was still deleted)", e);
      }
    },
  });
}
