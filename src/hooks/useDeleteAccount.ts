import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteOwnAccount, signOut } from "../lib/auth";

/**
 * Permanently deletes the current user's account (see deleteOwnAccount --
 * the delete_own_account RPC does the actual server-side work) and returns
 * them to the auth screen in the same app session.
 *
 * Same "cleanup must never mask an already-successful deletion" reasoning
 * as useDeleteGroup: once the RPC resolves, the account is gone
 * server-side regardless of what happens next, so every cleanup step below
 * is independently best-effort. signOut("local") is the one exception --
 * it's the step RootNavigator's routing actually depends on (session
 * becoming null), and using the "local" scope means it has no network
 * dependency to fail on in the first place (see auth.ts's signOut doc
 * comment).
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteOwnAccount,
    onSuccess: async () => {
      try {
        queryClient.clear();
      } catch (e) {
        if (__DEV__) console.warn("Delete Account: query cache clear failed (account was still deleted)", e);
      }
      try {
        // Wipes every per-group AsyncStorage key (club favorites, Winners
        // Stay sessions, last-selected group, ...) in one pass -- unlike
        // deleting a single group, the account itself owning ALL of that
        // local data is gone, so there's no narrower key list to compute.
        await AsyncStorage.clear();
      } catch (e) {
        if (__DEV__) console.warn("Delete Account: AsyncStorage clear failed (account was still deleted)", e);
      }
      try {
        await signOut("local");
      } catch (e) {
        if (__DEV__) console.warn("Delete Account: signOut failed (account was still deleted)", e);
      }
    },
  });
}
