// components/mgr/views/pars.tsx — Pars and allocation drawing. Live passes
// LinkTabs as filters and ReplenishForm as footer / createAction; inventory
// uses the fixture verbs and the two footer buttons.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ParsViewModel } from "@/lib/mgr/pars-view";

export type { ParsViewModel };

export function ParsView({
  model,
  createAction,
  filters,
  footer,
  empty,
  linkRows,
  rowAction,
}: {
  model: ParsViewModel;
  createAction?: ReactNode;
  filters?: ReactNode;
  footer?: ReactNode;
  empty?: string;
  /** Live: row verbs are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
  /** Live: CommandForm on a standing row. Inventory omits and uses verb/href. */
  rowAction?: (row: ParsViewModel["rows"][number]) => ReactNode;
}) {
  return (
    <>
      {E.back("Finished goods", model.title, createAction, model.backHref)}
      {empty ? E.blank(empty) : (
        <>
          {filters}
          {model.atp ? E.num(model.atp, model.atpDetail) : null}
          {model.rows.map((row) => (
            <Fragment key={row.key}>
              {E.row(row.title, row.detail, rowAction?.(row) ?? (row.verb ? E.act(row.verb, row.tone, linkRows ? row.href : undefined) : ""))}
            </Fragment>
          ))}
          {footer === undefined ? E.btns([["Adjust selected", "p"], ["Edit par", "g"]]) : footer}
        </>
      )}
    </>
  );
}
