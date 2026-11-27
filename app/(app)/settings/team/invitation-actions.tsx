"use client";

// Team → Pending invitations row verbs (#1204): Resend runs
// resend_account_invitation, Cancel runs revoke_account_invitation. On
// success useCommandAction's run refreshes Team (its default), so the row
// updates or leaves; the view is PendingInvitationActionsView. A new-account
// invitee is already a member, so their row resends the Auth email
// (resend_staff_invite) and cancels by ending the membership (revoke_staff).
import { toast } from "sonner";
import { PendingInvitationActionsView } from "@/components/mgr/views/team-controls";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function InvitationActions({ inviteId, email }: { inviteId: string; email: string }) {
  const { busy, error, run } = useCommandAction();
  const options = { target: inviteId };
  return <PendingInvitationActionsView email={email} busy={busy} error={error}
    onResend={() => void run("resend_account_invitation", { inviteId }, () => toast.success(`Invitation resent to ${email}`), options)}
    onCancel={() => run("revoke_account_invitation", { inviteId }, undefined, options)} />;
}

export function InvitedMemberActions({ userId, email }: { userId: string; email: string }) {
  const { busy, error, run } = useCommandAction();
  const options = { target: userId };
  return <PendingInvitationActionsView email={email} busy={busy} error={error}
    onResend={() => void run("resend_staff_invite", { userId }, () => toast.success(`Invitation resent to ${email}`), options)}
    onCancel={() => run("revoke_staff", { userId }, undefined, options)} />;
}
