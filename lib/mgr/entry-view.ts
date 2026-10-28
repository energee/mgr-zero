// lib/mgr/entry-view.ts — view-model for Sign in / Reset / Set password family.
import { sentenceCase } from "@/lib/mgr/labels";
import type { PasswordErrors } from "@/lib/auth/password";
export type EntryViewModel = {
  title: string;
  inputs: string[];
  field?: { label: string; value: string };
  primary: string;
  pendingLabel?: string;
  secondary?: string;
  /** The secondary sign-in action requires only the email field. */
  secondaryEmailOnly?: boolean;
  link?: { label: string; to: string };
  /** The other audience's sign-in: staff and portal sign-in link each other. */
  switchLink?: { label: string; to: string };
  info?: string;
  note?: string;
  error?: string;
  passwordRules?: string;
  passwordErrors?: PasswordErrors;
  extraPrimary?: string;
};

export const signInModel: EntryViewModel = {
  title: "Sign in",
  inputs: ["Email", "Password"],
  primary: "Sign in",
  pendingLabel: "Signing in…",
  secondary: "Email me a link",
  secondaryEmailOnly: true,
  link: { label: "Forgot password?", to: "Reset password" },
  switchLink: { label: "Customer? Sign in to the portal", to: "Portal sign in" },
};

export const portalSignInModel: EntryViewModel = {
  title: "Sign in to your account",
  inputs: ["Email", "Password"],
  primary: "Sign in",
  pendingLabel: "Signing in…",
  link: { label: "Forgot password?", to: "Portal forgot password" },
  switchLink: { label: "Brewery staff? Sign in to MGR", to: "Sign in" },
};

export function toAcceptInviteViewProps(breweryName: string, roles: readonly string[]): EntryViewModel {
  return { title: `Join ${breweryName}`, inputs: ["Your name", "Choose a password"], field: { label: "Role", value: roles.map(sentenceCase).join(", ") }, primary: `Join ${breweryName}` };
}

export const expiredInviteModel: EntryViewModel = {
  title: "Invite expired", inputs: [], primary: "Reset password", secondary: "Back to sign in",
  note: "This invite is no longer valid.",
  info: "Sign in or reset your password. Contact the brewery if access is still missing.",
};

export const resetPasswordModel: EntryViewModel = {
  title: "Reset password", inputs: ["Email"], primary: "Send reset link", secondary: "Back to sign in",
};
export const portalForgotPasswordModel: EntryViewModel = {
  ...resetPasswordModel,
};
export const noMembershipModel: EntryViewModel = {
  title: "No brewery yet", inputs: [],
  note: "This login is not on a brewery or a customer account.",
  info: "Contact your brewery administrator about access.",
  primary: "Create brewery", extraPrimary: "Sign out",
};
/** A staff login on no customer account sees this when it opens the portal; staff roles never grant the portal (#1145). */
export const portalStaffOnlyModel: EntryViewModel = {
  title: "Portal is for customers", inputs: [],
  note: "The portal is for customer accounts. You are signed in as staff.",
  info: "To use the portal yourself, ask an Admin or Sales to invite your email to a customer account.",
  primary: "Back to Today", extraPrimary: "Sign out",
};
export const expiredResetModel: EntryViewModel = {
  title: "Reset link expired", inputs: [],
  note: "This reset link is no longer valid.", primary: "Request a new link",
};

export const pageNotFoundModel: EntryViewModel = {
  title: "Not found", inputs: [], primary: "Back to Today",
  note: "There is no page at this address. The link may be wrong or out of date.",
};
/** `?error=` codes savePassword passes back: Supabase Auth codes, field names, and its own reauthentication codes. */
const SET_PASSWORD_ERRORS: Record<string, string> = {
  same_password: "Choose a password different from your current one.",
  weak_password: "Choose a stronger password.",
  currentPassword: "Enter your current password, or request a reset link if you sign in without one.",
  password: "Use at least 8 characters and choose a password different from your current one.",
  confirmPassword: "Confirm your new password. The new passwords must match.",
  wrong_current: "Your current password is incorrect.",
  reauth_failed: "Your current password could not be checked. Try again, or request a reset link.",
};

/**
 * `error` is the `?error=` code; any other value (a crafted link) shows the generic error, never its own text.
 * Headed Change password, like the Me link that opens it; the recovery link lands on the same page (#1108).
 */
export function toSetPasswordViewProps(account: string, error?: string, recovery = false): EntryViewModel {
  const message = error ? SET_PASSWORD_ERRORS[error] ?? "Your password was not saved. Try again." : undefined;
  const passwordErrors: PasswordErrors = {};
  if (error === "wrong_current" || error === "currentPassword") passwordErrors.currentPassword = message;
  if (error === "password" || error === "weak_password" || error === "same_password") passwordErrors.password = message;
  if (error === "confirmPassword") passwordErrors.confirmPassword = message;
  return {
    title: "Change password",
    inputs: [...(recovery ? [] : ["Current password"]), "Choose a password", "Confirm new password"],
    field: { label: "Account", value: account }, primary: "Save password", secondary: "Back to MGR",
    passwordRules: "Use at least 8 characters and choose a password different from your current one.",
    info: recovery ? "Your reset link verified this account. Choose and confirm your new password." : undefined,
    link: { label: "Need a reset link?", to: "Reset password" },
    // A field's error is drawn beside that field; only the rest go in the top alert.
    error: Object.keys(passwordErrors).length ? undefined : message, passwordErrors,
  };
}

/** Only local destinations may leave an entry card; unsafe or looping paths use its fallback. */
export function passwordReturnHref(next?: string, fallback = "/"): string {
  if (!next || !/^\/(?!\/)[^\s\\]*$/.test(next)) return fallback;
  const destination = new URL(next, "https://mgr.invalid");
  if (destination.pathname === "/password" || destination.pathname.startsWith("//")) return fallback;
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

/** This outcome must remain readable after Auth clears cookies on a failed sign-out. */
export function toPasswordSavedViewProps(error: string | undefined, canRetry: boolean): EntryViewModel {
  let warning = "We could not confirm that other sessions were signed out.";
  if (error === "signout_failed") warning = "Other sessions were signed out, but we could not confirm that this reset session ended.";
  return {
    title: "Password saved", inputs: [], primary: "Sign in with your new password",
    error: warning,
    info: `Your password was saved. You do not need to change it again. ${canRetry ? "Select Sign out all sessions to try again." : "Sign in with your new password, then use Sign out to end all sessions."}`,
    extraPrimary: canRetry ? "Sign out all sessions" : undefined,
  };
}
