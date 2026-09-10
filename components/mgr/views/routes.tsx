// components/mgr/views/routes.tsx — Routes / Deliveries list. Live slots the
// list_routes rows; inventory draws Work chips.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { RoutesViewModel } from "@/lib/mgr/routes-view";

export type { RoutesViewModel };

export function RoutesView({
  model,
  createAction,
  tabs,
  list,
  linkRows,
}: {
  model: RoutesViewModel;
  createAction?: ReactNode;
  tabs?: ReactNode | null;
  list?: ReactNode;
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd(model.title, model.subtitle, createAction !== undefined ? createAction : E.btn("New route"))}
      {tabs === undefined ? E.tabs(model.workChips, model.workChipIndex, "w-full", model.workTabs) : tabs}
      {list !== undefined
        ? list
        : model.empty
          ? E.blank(model.empty)
          : model.rows.map((row) => (
            <Fragment key={row.key}>
              {E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined), row.warning ? "w" : "")}
            </Fragment>
          ))}
    </>
  );
}
