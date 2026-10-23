"use client";

// Team → Pending invitations row verbs (#1204): Resend runs
// resend_account_invitation, Cancel runs revoke_account_invitation. On
// success useCommandAction's run refreshes Team (its default), so the row
// updates or leaves; the view is PendingInvitationActionsView.
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
