jest.mock("../src/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      updateUser: jest.fn(),
    },
    rpc: jest.fn(),
  },
}));

import { supabase } from "../src/lib/supabase";
import { deleteAccountConfirmationMatches, deleteOwnAccount, exchangeRecoveryCode, requestPasswordReset, signOut, signUpWithEmail, updatePassword } from "../src/lib/auth";

const mockSignUp = supabase.auth.signUp as jest.Mock;
const mockResetPasswordForEmail = supabase.auth.resetPasswordForEmail as jest.Mock;
const mockExchangeCodeForSession = supabase.auth.exchangeCodeForSession as jest.Mock;
const mockUpdateUser = supabase.auth.updateUser as jest.Mock;
const mockSignOut = supabase.auth.signOut as jest.Mock;
const mockRpc = supabase.rpc as jest.Mock;

beforeEach(() => {
  mockSignUp.mockReset();
  mockResetPasswordForEmail.mockReset();
  mockExchangeCodeForSession.mockReset();
  mockUpdateUser.mockReset();
  mockSignOut.mockReset();
  mockRpc.mockReset();
});

describe("signUpWithEmail", () => {
  it("passes emailRedirectTo through to the provider so the confirmation link opens the app, not the project's Site URL", async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
    await signUpWithEmail("real@example.com", "password123", "fcrival://auth/callback");
    expect(mockSignUp).toHaveBeenCalledWith({
      email: "real@example.com",
      password: "password123",
      options: { emailRedirectTo: "fcrival://auth/callback" },
    });
  });

  it("omits options entirely when no redirect is given, rather than sending emailRedirectTo: undefined", async () => {
    mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
    await signUpWithEmail("real@example.com", "password123");
    expect(mockSignUp).toHaveBeenCalledWith({ email: "real@example.com", password: "password123", options: undefined });
  });

  it("reports hasSession accurately (false when email confirmation is required, true when auto-confirmed)", async () => {
    mockSignUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(signUpWithEmail("real@example.com", "password123")).resolves.toEqual({ hasSession: false });

    mockSignUp.mockResolvedValueOnce({ data: { session: {} }, error: null });
    await expect(signUpWithEmail("real@example.com", "password123")).resolves.toEqual({ hasSession: true });
  });

  it("throws on a genuine provider error", async () => {
    mockSignUp.mockResolvedValue({ data: null, error: { message: "User already registered" } });
    await expect(signUpWithEmail("real@example.com", "password123")).rejects.toThrow("User already registered");
  });
});

describe("requestPasswordReset", () => {
  it("resolves without error for a registered-looking email, calling the provider exactly once", async () => {
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await expect(requestPasswordReset("real@example.com", "fcrival://reset-password")).resolves.toBeUndefined();
    expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith("real@example.com", { redirectTo: "fcrival://reset-password" });
  });

  it("resolves identically for an unregistered-looking email -- the provider call is the only branch, so success never reveals account existence", async () => {
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    await expect(requestPasswordReset("nobody@example.com", "fcrival://reset-password")).resolves.toBeUndefined();
    expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(1);
  });

  it("throws on a genuine provider error (e.g. rate limiting), surfacing it rather than swallowing it", async () => {
    mockResetPasswordForEmail.mockResolvedValue({ data: null, error: { message: "email rate limit exceeded" } });
    await expect(requestPasswordReset("real@example.com", "fcrival://reset-password")).rejects.toThrow("email rate limit exceeded");
  });
});

describe("exchangeRecoveryCode", () => {
  it("resolves when the provider accepts the code", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    await expect(exchangeRecoveryCode("valid-code")).resolves.toBeUndefined();
  });

  it("throws when the code is expired or already used", async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: null, error: { message: "Token has expired or is invalid" } });
    await expect(exchangeRecoveryCode("expired-code")).rejects.toThrow("Token has expired or is invalid");
  });
});

describe("updatePassword", () => {
  it("resolves when the provider accepts the new password", async () => {
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
    await expect(updatePassword("newSecurePassword")).resolves.toBeUndefined();
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "newSecurePassword" });
  });

  it("throws when the provider rejects the update", async () => {
    mockUpdateUser.mockResolvedValue({ data: null, error: { message: "Auth session missing" } });
    await expect(updatePassword("newSecurePassword")).rejects.toThrow("Auth session missing");
  });
});

describe("signOut", () => {
  it("defaults to the 'global' scope (the regular Log Out button's behavior, unchanged)", async () => {
    mockSignOut.mockResolvedValue({ error: null });
    await expect(signOut()).resolves.toBeUndefined();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("supports the 'local' scope (used after account deletion, no network dependency)", async () => {
    mockSignOut.mockResolvedValue({ error: null });
    await expect(signOut("local")).resolves.toBeUndefined();
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("throws when the provider rejects the sign-out", async () => {
    mockSignOut.mockResolvedValue({ error: { message: "Network error" } });
    await expect(signOut()).rejects.toThrow("Network error");
  });
});

describe("deleteAccountConfirmationMatches", () => {
  it("matches the exact literal 'DELETE'", () => {
    expect(deleteAccountConfirmationMatches("DELETE")).toBe(true);
  });

  it("tolerates leading/trailing whitespace", () => {
    expect(deleteAccountConfirmationMatches("  DELETE  ")).toBe(true);
  });

  it("rejects a lowercase or mixed-case typo", () => {
    expect(deleteAccountConfirmationMatches("delete")).toBe(false);
    expect(deleteAccountConfirmationMatches("Delete")).toBe(false);
  });

  it("rejects an empty, partial, or unrelated value", () => {
    expect(deleteAccountConfirmationMatches("")).toBe(false);
    expect(deleteAccountConfirmationMatches("DELET")).toBe(false);
    expect(deleteAccountConfirmationMatches("DELETE ME")).toBe(false);
  });
});

describe("deleteOwnAccount", () => {
  it("calls the delete_own_account RPC with no parameters (the server derives identity from auth.uid())", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    await deleteOwnAccount();
    expect(mockRpc).toHaveBeenCalledWith("delete_own_account");
  });

  it("throws when the RPC reports the caller is blocked by group ownership", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "Transfer ownership or delete these groups before deleting your account: Friday FC" } });
    await expect(deleteOwnAccount()).rejects.toThrow(/Transfer ownership/);
  });

  it("throws on a generic RPC error", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
    await expect(deleteOwnAccount()).rejects.toThrow("permission denied");
  });
});
