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

/** Call only with claims verified by Auth getClaims(), never decoded browser claims.
 * Recovery remains valid for the reset-link lifetime (one hour), not indefinitely
 * through refreshes of a recovery session. Metadata and URL flags grant nothing.
 */
export function hasRecentRecovery(claims: { sub?: string; amr?: unknown } | null, userId: string, now = Math.floor(Date.now() / 1000)): boolean {
  if (claims?.sub !== userId || !Array.isArray(claims.amr)) return false;
  return claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object" || !("method" in entry) || !("timestamp" in entry)) return false;
    return entry.method === "recovery" && typeof entry.timestamp === "number" && entry.timestamp <= now && now - entry.timestamp <= 3600;
  });
}
