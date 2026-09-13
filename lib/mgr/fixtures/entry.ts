// lib/mgr/fixtures/entry.ts — Sign in, reset, set-password, no-membership.
import type { EntryViewModel } from "@/lib/mgr/entry-view";
import { toSetPasswordViewProps } from "@/lib/mgr/entry-view";
export { expiredInviteModel as expiredInvite, resetPasswordModel as resetPassword, portalForgotPasswordModel as portalForgotPassword, noMembershipModel as noMembership, expiredResetModel as expiredReset } from "@/lib/mgr/entry-view";

export const signIn: EntryViewModel = {
  title: "Sign in",
  inputs: ["Email", "Password"],
  primary: "Sign in",
  secondary: "Email me a link",
  link: { label: "Forgot password?", to: "Reset password" },
};

export const setPassword = toSetPasswordViewProps("maria@demobrewing.com");

export const portalSignIn: EntryViewModel = {
  title: "Sign in to your account",
  inputs: ["Email", "Password"],
  primary: "Sign in",
  link: { label: "Forgot password?", to: "Portal forgot password" },
};

export const portalSetPassword = toSetPasswordViewProps("jordan@ridgelinetap.com");
