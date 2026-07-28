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
  },
}));

import { supabase } from "../src/lib/supabase";
import { exchangeRecoveryCode, requestPasswordReset, updatePassword } from "../src/lib/auth";

const mockResetPasswordForEmail = supabase.auth.resetPasswordForEmail as jest.Mock;
const mockExchangeCodeForSession = supabase.auth.exchangeCodeForSession as jest.Mock;
const mockUpdateUser = supabase.auth.updateUser as jest.Mock;

beforeEach(() => {
  mockResetPasswordForEmail.mockReset();
  mockExchangeCodeForSession.mockReset();
  mockUpdateUser.mockReset();
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
