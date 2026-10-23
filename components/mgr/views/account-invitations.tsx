import { E } from "@/components/mgr/e";
import type { AccountInvitation } from "@/lib/mgr/account-invitations";
import { sentenceCase } from "@/lib/mgr/labels";

export function AccountInvitationsView({ invitations, action, error, continueHref }: {
  invitations: AccountInvitation[]; action?: (form: FormData) => Promise<void>; error?: string; continueHref?: string;
}) {
  return <>
    {E.hd("Invitations")}
    {E.info("Joining grants access to the brewery or customer account shown. Your existing password stays the same.")}
    {error && E.note(error, "alert")}
    {/* A staff invitation always carries a role (invite_requests check), so the fallback never shows. */}
    {invitations.length ? invitations.map(invite => <form key={invite.id} action={action}>
      <input type="hidden" name="inviteId" value={invite.id} />
      {E.row(invite.breweryName, invite.kind === "staff" ? `Staff · ${sentenceCase(invite.role ?? "")}` : `Customer · ${invite.customerName}`,
        E.btn("Accept invitation"))}
    </form>) : E.blank("No pending invitations. Ask the brewery for a new invitation if yours expired.")}
    {E.link("Continue", "Today", continueHref)}
  </>;
}
