// lib/mgr/fixtures/entry.ts — Sign in, reset, set-password, no-membership, portal staff only.
import { toSetPasswordViewProps } from "@/lib/mgr/entry-view";
export { signInModel as signIn, portalSignInModel as portalSignIn, expiredInviteModel as expiredInvite, resetPasswordModel as resetPassword, portalForgotPasswordModel as portalForgotPassword, noMembershipModel as noMembership, portalStaffOnlyModel as portalStaffOnly, expiredResetModel as expiredReset } from "@/lib/mgr/entry-view";

export const setPassword = toSetPasswordViewProps("maria@demobrewing.com");

export const portalSetPassword = toSetPasswordViewProps("jordan@ridgelinetap.com");
