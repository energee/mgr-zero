// components/mgr/views/today.tsx — Today and persona landings. Live maps
// get_today / taproomTodayRows onto rows with linkRows; inventory uses fixtures.
// The role's quick actions (model.actions) sit under the header, above the rows,
// which are the shared queue table (queue-table.tsx) in get_today's order.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { TodayViewModel } from "@/lib/mgr/today-view";
import { QueueTable } from "./queue-table";

export function TodayView({
  model,
  footer,
  emptyAction,
  linkRows,
}: {
  model: TodayViewModel;
  footer?: ReactNode;
  emptyAction?: ReactNode;
  linkRows?: boolean;
}) {
  const actions = model.actions ?? [];
  return (
    <>
      {E.hd("Today")}
      {/* A lone action spans the phone column, as E.btn does; two or more share a grid. */}
      {actions.length === 1 && E.btn(actions[0].label, "g", actions[0].href)}
      {actions.length > 1 && E.btns(actions.map((a) => [a.label, "g", a.href]))}
      {model.empty
        ? (
          <>
            {E.blank(model.empty)}
            {emptyAction !== undefined ? emptyAction : (model.emptyVerb ? E.btn(model.emptyVerb, "g") : null)}
          </>
        )
        : <QueueTable rows={model.rows} linkRows={linkRows} />}
      {footer}
    </>
  );
}
