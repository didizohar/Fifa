const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export type NewPasswordError = "tooShort" | "mismatch";

/** Client-side validation for the "set a new password" step -- mirrors Supabase's own minimum length so the error surfaces before the network round-trip. */
export function validateNewPassword(password: string, confirmPassword: string): NewPasswordError | null {
  if (password.length < 6) return "tooShort";
  if (password !== confirmPassword) return "mismatch";
  return null;
}
