import { describe, expect, it } from "vitest";
import { passwordChangeErrors, hasRecentRecovery } from "@/lib/auth/password";

function form(password = "new-password-1319", confirmPassword = password, currentPassword = "old-password-1319") {
  return { password, confirmPassword, currentPassword };
}

describe("password change validation", () => {
  it("requires current password outside recovery", () => {
    expect(passwordChangeErrors(form("new-password", "new-password", ""), false)).toEqual({ currentPassword: "Enter your current password." });
  });
  it("checks length, confirmation, and same password without trimming secrets", () => {
    expect(passwordChangeErrors(form("short", "different"), false)).toEqual({ password: "Use at least 8 characters.", confirmPassword: "The new passwords do not match." });
    expect(passwordChangeErrors(form("same-password", "same-password", "same-password"), false)).toEqual({ password: "Choose a password different from your current one." });
    expect(passwordChangeErrors(form("  secret", "  secret", "old"), false)).toEqual({});
    expect(passwordChangeErrors(form("new-password", ""), false).confirmPassword).toBe("Confirm your new password.");
  });
  it("allows passwordless accounts only with verified recent recovery", () => {
    expect(passwordChangeErrors(form("new-password", "new-password", ""), true)).toEqual({});
    const now = 10000;
    expect(hasRecentRecovery({ sub: "owner", amr: [{ method: "recovery", timestamp: now - 30 }] }, "owner", now)).toBe(true);
    for (const claims of [
      { sub: "other", amr: [{ method: "recovery", timestamp: now }] },
      { sub: "owner", amr: [{ method: "magiclink", timestamp: now }] },
      { sub: "owner", amr: [{ method: "otp", timestamp: now }] },
      { sub: "owner", amr: [{ method: "recovery", timestamp: now - 3601 }] },
      { sub: "owner", amr: [{ method: "recovery", timestamp: now + 1 }] },
      { sub: "owner", user_metadata: { recovery: true } },
      null,
    ]) expect(hasRecentRecovery(claims, "owner", now)).toBe(false);
  });
});
