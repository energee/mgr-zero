// lib/mgr/team-view.ts — view-model for Team (list_team_members and
// list_pending_invitations).
import type { PendingInvitation, TeamMember } from "@/lib/commands/invites";
import { formatDate } from "@/lib/date-format";
import { sentenceCase, staffRolesLabel } from "@/lib/mgr/labels";

export type TeamRowView = {
  key: string;
  title: string;
  detail: string;
  you?: boolean;
  src?: string;
};

/** The RPC's name is `Profile name <email>`, or the email alone when no name is
 *  saved (#1659), so the title identifies the account and the detail is only
 *  the roles. */
export function toTeamMemberRow(member: Pick<TeamMember, "userId" | "name" | "roles">, currentUserId?: string): TeamRowView {
  return { key: member.userId, title: member.name, detail: staffRolesLabel(member.roles), you: member.userId === currentUserId };
}

/** One pending invitation: the email, then "Role · Sent <day>". */
export type PendingInvitationRowView = { key: string; email: string; detail: string };

export type TeamViewModel = {
  backHref?: string;
  rows: TeamRowView[];
  invitations: PendingInvitationRowView[];
};

/** The sent day is the brewery's calendar day, like every timestamp on screen. */
export const toPendingInvitationRows = (invitations: PendingInvitation[], timeZone: string): PendingInvitationRowView[] =>
  invitations.map((i) => ({ key: i.id, email: i.email, detail: `${sentenceCase(i.role)} · Sent ${formatDate(i.createdAt, timeZone)}` }));
