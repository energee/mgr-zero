// components/mgr/views/team.tsx — Team roster. Live slots MemberForm rows and
// InviteForm; inventory draws unlabeled navs and Invite staff.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { TeamViewModel } from "@/lib/mgr/team-view";

export type { TeamViewModel };

export function TeamView({
  model,
  createAction,
  rows,
}: {
  model: TeamViewModel;
  createAction?: ReactNode;
  rows?: ReactNode;
}) {
  return (
    <>
      {E.back("Settings", "Team", undefined, model.backHref)}
      {rows ?? model.rows.map((row) => (
        <Fragment key={row.key}>
          {row.you
            ? E.row(row.title, row.detail, "you", "", E.face())
            : E.nav(row.title, row.detail, "", E.face({ src: row.src }))}
        </Fragment>
      ))}
      {createAction !== undefined ? createAction : E.btn("Invite staff")}
    </>
  );
}
