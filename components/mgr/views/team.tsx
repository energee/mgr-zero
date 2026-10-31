// components/mgr/views/team.tsx — Team roster and pending invitations. Live
// slots MemberForm rows, InvitationActions and InviteForm; inventory draws
// unlabeled navs, inert Resend/Cancel and Invite staff.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { PendingInvitationActionsView } from "@/components/mgr/views/team-controls";
import type { TeamViewModel, TeamRowView } from "@/lib/mgr/team-view";
import { Button } from "@/components/ui/button";

export function TeamRosterRowView({ row }: { row: TeamRowView }) {
  const avatar = E.face({ src: row.src, name: row.title });
  return row.you ? E.row(row.title, row.detail, "you", "", avatar) : E.nav(row.title, row.detail, "", avatar);
}

export function TeamView({
  model,
  createAction,
  memberActions,
  invitationActions,
}: {
  model: TeamViewModel;
  createAction?: ReactNode;
  memberActions?: Record<string, ReactNode>;
  /** Live Resend/Cancel per invitation, keyed by the invitation row's `key`. */
  invitationActions?: Record<string, ReactNode>;
}) {
  return (
    <>
      {E.back("Settings", "Team", undefined, model.backHref)}
      {model.rows.map((row) => (
        <Fragment key={row.key}>
          {memberActions?.[row.key] !== undefined ? memberActions[row.key] : <TeamRosterRowView row={row} />}
        </Fragment>
      ))}
      <section aria-label="Pending invitations" className="flex flex-col gap-3">
        {E.ttl("Pending invitations")}
        {model.invitations.length === 0 ? E.polite("No pending invitations") : model.invitations.map((invite) => (
          <Fragment key={invite.key}>
            {E.row(invite.email, invite.detail, invitationActions?.[invite.key] ?? <PendingInvitationActionsView email={invite.email} />)}
          </Fragment>
        ))}
      </section>
      {createAction !== undefined ? createAction : <Button variant="outline">Invite staff</Button>}
    </>
  );
}
