// components/mgr/views/team.tsx — Team roster. Live slots MemberForm rows and
// InviteForm; inventory draws unlabeled navs and Invite staff.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { TeamViewModel, TeamRowView } from "@/lib/mgr/team-view";
import { Button } from "@/components/ui/button";

export type { TeamViewModel };

export function TeamRosterRowView({ row }: { row: TeamRowView }) {
  const avatar = E.face({ src: row.src, name: row.title.replace(/^@/, "") });
  return row.you ? E.row(row.title, row.detail, "you", "", avatar) : E.nav(row.title, row.detail, "", avatar);
}

export function TeamView({
  model,
  createAction,
  memberActions,
}: {
  model: TeamViewModel;
  createAction?: ReactNode;
  memberActions?: Record<string, ReactNode>;
}) {
  return (
    <>
      {E.back("Settings", "Team", undefined, model.backHref)}
      {model.rows.map((row) => (
        <Fragment key={row.key}>
          {memberActions?.[row.key] !== undefined ? memberActions[row.key] : <TeamRosterRowView row={row} />}
        </Fragment>
      ))}
      {createAction !== undefined ? createAction : <Button variant="outline">Invite staff</Button>}
    </>
  );
}
