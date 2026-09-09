// components/mgr/views/transfers.tsx — Transfers list. Live passes
// NewTransferForm as createAction, hides Work chips, and linkRows. Inventory
// draws New transfer, Work tabs, and unlabeled Pick/Receive.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { TransfersViewModel } from "@/lib/mgr/transfers-view";

export type { TransfersViewModel };

export function TransfersView({
  model,
  createAction,
  tabs,
  linkRows,
}: {
  model: TransfersViewModel;
  createAction?: ReactNode;
  /** Live omits Work chips. Inventory draws them when this is omitted. */
  tabs?: ReactNode | null;
  /** Live: verbs are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.hd(model.title, "between locations", createAction !== undefined ? createAction : E.btn("New transfer"))}
      {tabs === undefined ? E.tabs(model.workChips, model.workChipIndex, "w-full", model.workTabs) : tabs}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(row.title, row.detail, E.act(row.verb, row.tone, linkRows ? row.href : undefined), row.warning ? "w" : "")}
          </Fragment>
        ))}
    </>
  );
}
