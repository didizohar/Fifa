import { isValidEmail, validateNewPassword } from "../src/lib/authValidation";

describe("isValidEmail", () => {
  it("accepts a well-formed email", () => {
    expect(isValidEmail("player@example.com")).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidEmail("  player@example.com  ")).toBe(true);
  });

  it.each(["", "not-an-email", "missing-domain@", "@missing-local.com", "spaces in@email.com"])(
    "rejects %j",
    (value) => {
      expect(isValidEmail(value)).toBe(false);
    },
  );
});

describe("validateNewPassword", () => {
  it("returns null for a valid, matching password pair", () => {
    expect(validateNewPassword("supersecret", "supersecret")).toBeNull();
  });

  it("flags a password shorter than 6 characters, even if the confirmation matches", () => {
    expect(validateNewPassword("abc", "abc")).toBe("tooShort");
  });

  it("flags a mismatch when both passwords meet the length requirement", () => {
    expect(validateNewPassword("supersecret", "supersecret2")).toBe("mismatch");
  });

  it("reports the length error before the mismatch error when both apply", () => {
    expect(validateNewPassword("abc", "xyz")).toBe("tooShort");
  });
});
