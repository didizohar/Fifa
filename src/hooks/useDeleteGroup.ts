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
 */
export function useDeleteGroup(userId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, confirmName }: { groupId: string; confirmName: string }) => {
      await deleteGroup(groupId, confirmName);
      return groupId;
    },
    onSuccess: async (groupId) => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey.includes(groupId) });
      await clearGroupLocalData(groupId);
      await queryClient.invalidateQueries({ queryKey: groupKeys.mine(userId) });
    },
  });
}
