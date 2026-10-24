// lib/auth/password.ts — password-change rules shared by the browser form and savePassword.
export type PasswordFields = { currentPassword: string; password: string; confirmPassword: string };
export type PasswordErrors = Partial<Record<keyof PasswordFields, string>>;

/** Shared browser/server checks. Password whitespace is significant. */
export function passwordChangeErrors(fields: PasswordFields, recovery: boolean): PasswordErrors {
  const errors: PasswordErrors = {};
  if (!recovery && !fields.currentPassword) errors.currentPassword = "Enter your current password.";
  if (fields.password.length < 8) errors.password = "Use at least 8 characters.";
  else if (!recovery && fields.password === fields.currentPassword) errors.password = "Choose a password different from your current one.";
  if (!fields.confirmPassword) errors.confirmPassword = "Confirm your new password.";
  else if (fields.password !== fields.confirmPassword) errors.confirmPassword = "The new passwords do not match.";
  return errors;
}

/** Where a saved password sends someone to sign in again: a buyer to the portal's page. */
export function signInPath(portal: boolean): string {
  return portal ? "/portal/login" : "/login";
}

/** Set by savePassword; the Password saved outcome renders only while it exists. */
export const PASSWORD_SAVED_COOKIE = "mgr_password_saved";

/** Call only with claims verified by Auth getClaims(), never decoded browser claims.
 * Recovery lasts one hour from when the reset link was opened (the AMR timestamp),
 * not indefinitely through refreshes of a recovery session. Auth stamps that time
 * with its own clock, so a grant up to a minute in this server's future still counts.
 * Metadata and URL flags grant nothing.
 */
export function hasRecentRecovery(claims: { sub?: string; amr?: unknown } | null, userId: string, now = Math.floor(Date.now() / 1000)): boolean {
  if (claims?.sub !== userId || !Array.isArray(claims.amr)) return false;
  return claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object" || !("method" in entry) || !("timestamp" in entry)) return false;
    return entry.method === "recovery" && typeof entry.timestamp === "number" && entry.timestamp <= now + 60 && now - entry.timestamp <= 3600;
  });
}
