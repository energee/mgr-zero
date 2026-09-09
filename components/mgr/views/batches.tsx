// components/mgr/views/batches.tsx — Batches Work list. Live slots the
// list_batches rows and vessel forms; inventory draws Planned / Active.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { BatchesViewModel } from "@/lib/mgr/batches-view";

export type { BatchesViewModel };

export function BatchesView({
  model,
  createAction,
  tabs,
  list,
  footer,
  linkRows,
}: {
  model: BatchesViewModel;
  createAction?: ReactNode;
  tabs?: ReactNode | null;
  list?: ReactNode;
  footer?: ReactNode;
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd(model.title, model.subtitle, createAction !== undefined ? createAction : E.btn("New batch"))}
      {tabs === undefined ? E.tabs(model.workChips, model.workChipIndex, "w-full", model.workTabs) : tabs}
      {list !== undefined
        ? list
        : (
          <>
            {E.ttl("Planned")}
            {model.planned.map((row) => (
              <Fragment key={row.key}>
                {E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined))}
              </Fragment>
            ))}
            {E.ttl("Active")}
            {model.active.map((row) => (
              <Fragment key={row.key}>
                {E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined), row.warning ? "w" : "")}
              </Fragment>
            ))}
          </>
        )}
      {footer}
    </>
  );
}
