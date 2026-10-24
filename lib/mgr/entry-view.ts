// lib/mgr/entry-view.ts — view-model for Sign in / Reset / Set password family.
import { sentenceCase } from "@/lib/mgr/labels";
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
  info?: string;
  note?: string;
  error?: string;
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
};

export const portalSignInModel: EntryViewModel = {
  title: "Sign in to your account",
  inputs: ["Email", "Password"],
  primary: "Sign in",
  pendingLabel: "Signing in…",
  link: { label: "Forgot password?", to: "Portal forgot password" },
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
  title: "Reset password", inputs: ["Email"], primary: "Send reset link",
};
export const portalForgotPasswordModel: EntryViewModel = {
  ...resetPasswordModel, info: "If that email is on an account, a reset link is on its way.",
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
/** Supabase Auth error codes savePassword passes back as `?error=`. */
const SET_PASSWORD_ERRORS: Record<string, string> = {
  same_password: "Choose a password different from your current one.",
  weak_password: "Choose a stronger password.",
};

/**
 * `error` is the `?error=` code; any other value (a crafted link) shows the generic error, never its own text.
 * Headed Change password, like the Me link that opens it; the recovery link lands on the same page (#1108).
 */
export function toSetPasswordViewProps(account: string, error?: string): EntryViewModel {
  const message = error ? SET_PASSWORD_ERRORS[error] ?? "Your password was not saved. Try again." : undefined;
  return { title: "Change password", inputs: ["Choose a password"], field: { label: "Account", value: account }, primary: "Save password", error: message };
}
