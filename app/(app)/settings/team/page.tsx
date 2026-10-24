import { redirect } from "next/navigation";
import { TeamView } from "@/components/mgr/views/team";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { PendingInvitation, TeamMember } from "@/lib/commands/invites";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { getRequestIdentity } from "@/lib/auth/request-context";
import { deniedHref } from "@/lib/mgr/denied";
import { toPendingInvitationRows, toTeamMemberRow } from "@/lib/mgr/team-view";
import "@/lib/commands/all";
import { InviteForm } from "./invite-form";
import { InvitationActions } from "./invitation-actions";
import { MemberForm } from "./member-form";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/settings/team") };

export default async function TeamPage() {
  const [brewery, identity] = await Promise.all([getActiveBrewery(), getRequestIdentity()]);
  if (!brewery.roles.includes("admin")) redirect(deniedHref("Team", ["admin"]));
  const ctx = await buildContext(brewery.id);
  const [members, invitations] = await Promise.all([
    runCommand("list_team_members", {}, ctx) as Promise<TeamMember[]>,
    runCommand("list_pending_invitations", {}, ctx) as Promise<PendingInvitation[]>,
  ]);
  return (
    <TeamView
      model={{
        backHref: "/settings",
        rows: members.map((member) => toTeamMemberRow(member, identity?.userId)),
        invitations: toPendingInvitationRows(invitations, brewery.timeZone),
      }}
      memberActions={Object.fromEntries(members.filter(m => m.userId !== identity?.userId).map(m => [m.userId, <MemberForm key={m.userId} member={m} />]))}
      invitationActions={Object.fromEntries(invitations.map(i => [i.id, <InvitationActions key={i.id} inviteId={i.id} email={i.email} />]))}
      createAction={<InviteForm />}
    />
  );
}
