// lib/mgr/fixtures/entry.ts — Sign in, reset, set-password, no-membership.
import type { EntryViewModel } from "@/lib/mgr/entry-view";

export const signIn: EntryViewModel = {
  title: "Sign in",
  inputs: ["Email", "Password"],
  primary: "Sign in",
  secondary: "Email me a link",
  link: { label: "Forgot password?", to: "Reset password" },
};

export const resetPassword: EntryViewModel = {
  title: "Reset password",
  inputs: ["Email"],
  primary: "Send reset link",
};

export const setPassword: EntryViewModel = {
  title: "Set new password",
  inputs: ["Choose a password"],
  field: { label: "Account", value: "maria@demobrewing.com" },
  primary: "Save password",
};

export const portalSignIn: EntryViewModel = {
  title: "Sign in to your account",
  inputs: ["Email", "Password"],
  primary: "Sign in",
  link: { label: "Forgot password?", to: "Portal forgot password" },
};

export const portalForgotPassword: EntryViewModel = {
  title: "Reset password",
  inputs: ["Email"],
  primary: "Send reset link",
  info: "If that email is on an account, a reset link is on its way.",
};

export const portalSetPassword: EntryViewModel = {
  title: "Set new password",
  inputs: ["Choose a password"],
  field: { label: "Account", value: "jordan@ridgelinetap.com" },
  primary: "Save password",
};

export const noMembership: EntryViewModel = {
  title: "No brewery yet",
  inputs: [],
  note: "This login is not on a brewery or a customer account.",
  info: "Contact your brewery administrator about access.",
  primary: "Create brewery",
  extraPrimary: "Sign out",
};

export const expiredReset: EntryViewModel = {
  title: "Reset link expired",
  inputs: [],
  note: "This reset link is no longer valid.",
  primary: "Request a new link",
};
