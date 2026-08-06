import { supabase } from "./supabase";

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export interface SignUpResult {
  // false when email confirmation is required and no session was issued yet.
  hasSession: boolean;
}

export async function signUpWithEmail(email: string, password: string): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return { hasSession: data.session !== null };
}

/**
 * "local" (used after account deletion) only clears the client's own stored
 * session/token and fires the SIGNED_OUT event -- no network call to revoke
 * a server-side session, which matters once the account behind it no
 * longer exists: there's nothing left to revoke, and unlike the default
 * "global" scope, it can never fail due to a network error, guaranteeing
 * the user actually lands back on the auth screen in the same app session.
 */
export async function signOut(scope: "global" | "local" = "global"): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope });
  if (error) throw new Error(error.message);
}

/**
 * Requests a password reset email. Supabase's own design never reveals
 * whether `email` belongs to an account -- this resolves (or throws only on
 * a genuine transport/validation error) regardless of whether the address
 * is registered, so callers must not use success/failure here to infer that.
 */
export async function requestPasswordReset(email: string, redirectTo: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw new Error(error.message);
}

/** Exchanges a password-recovery deep link's auth code for a session. Throws if the code is missing, expired, or already used. */
export async function exchangeRecoveryCode(code: string): Promise<void> {
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw new Error(error.message);
}

/** Updates the password for the currently authenticated session (including a temporary password-recovery session). */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

const DELETE_ACCOUNT_CONFIRMATION_WORD = "DELETE";

/** Same trim + exact-match convention as groups.ts's groupNameConfirmationMatches -- a fixed literal (not the user's email/name) so it reads the same in both locales and isn't defeated by autocorrect/autocapitalize on a typed email. */
export function deleteAccountConfirmationMatches(typed: string): boolean {
  return typed.trim() === DELETE_ACCOUNT_CONFIRMATION_WORD;
}

/**
 * Permanently deletes the current user's Supabase Auth identity via the
 * delete_own_account RPC (SECURITY DEFINER, server-side -- see
 * supabase/migrations/20260806120000_delete_own_account.sql). Never touches
 * the service-role key from the client; auth.uid() inside the RPC is the
 * only identity it can ever act on. Does NOT sign the client out itself --
 * the caller (useDeleteAccount) does that afterward, since the local
 * session token is still technically "valid" shaped until signOut() clears
 * it, even though the account behind it is already gone server-side.
 */
export async function deleteOwnAccount(): Promise<void> {
  const { error } = await supabase.rpc("delete_own_account");
  if (error) throw new Error(error.message);
}
