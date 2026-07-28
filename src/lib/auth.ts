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

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
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
