// lib/mgr/team-view.ts — view-model for Team (list_team_members and
// list_pending_invitations).
import type { PendingInvitation } from "@/lib/commands/invites";
import { formatDate } from "@/lib/date-format";
import { sentenceCase } from "@/lib/mgr/labels";

export type TeamRowView = {
  key: string;
  title: string;
  detail: string;
  you?: boolean;
  src?: string;
};

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
