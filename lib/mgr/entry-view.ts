// lib/mgr/entry-view.ts — view-model for Sign in / Reset / Set password family.
export type EntryViewModel = {
  title: string;
  inputs: string[];
  field?: { label: string; value: string };
  primary: string;
  secondary?: string;
  link?: { label: string; to: string };
  info?: string;
  note?: string;
  extraPrimary?: string;
};

export function toEntryViewProps(s: EntryViewModel): EntryViewModel {
  return s;
}

export function toAcceptInviteViewProps(breweryName: string, role: string): EntryViewModel {
  return { title: `Join ${breweryName}`, inputs: ["Your name", "Choose a password"], field: { label: "Role", value: role }, primary: `Join ${breweryName}` };
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
export const expiredResetModel: EntryViewModel = {
  title: "Reset link expired", inputs: [],
  note: "This reset link is no longer valid.", primary: "Request a new link",
};
export function toSetPasswordViewProps(account: string): EntryViewModel {
  return { title: "Set new password", inputs: ["Choose a password"], field: { label: "Account", value: account }, primary: "Save password" };
}
