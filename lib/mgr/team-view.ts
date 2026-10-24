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

/** Use the saved profile name, with the RPC's email fallback when absent. */
export function toTeamMemberRow(member: Pick<TeamMember, "userId" | "name" | "email" | "roles">, currentUserId?: string): TeamRowView {
  return { key: member.userId, title: member.name, detail: `${member.email} · ${staffRolesLabel(member.roles)}`, you: member.userId === currentUserId };
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
