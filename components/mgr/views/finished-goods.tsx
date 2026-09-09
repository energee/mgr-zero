// components/mgr/views/finished-goods.tsx — Finished goods list. Live slots
// MovementForm as createAction, Add SKU after the header, and the movements
// ledger as footer. Inventory draws Add SKU and unlabeled Review/Shortfall.
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { FinishedGoodsViewModel } from "@/lib/mgr/finished-goods-view";

export type { FinishedGoodsViewModel };

export function FinishedGoodsView({
  model,
  createAction,
  afterHeader,
  footer,
  linkRows,
}: {
  model: FinishedGoodsViewModel;
  createAction?: ReactNode;
  /** Live: Add SKU. Inventory already puts Add SKU in the header. */
  afterHeader?: ReactNode;
  /** Live: movements ledger. Inventory omits this. */
  footer?: ReactNode;
  /** Live: Review/Shortfall are links. Inventory leaves them unlabeled taps. */
  linkRows?: boolean;
}) {
  return (
    <>
      {E.back("Beer", "Finished goods", createAction !== undefined ? createAction : E.btn("Add SKU"), model.backHref)}
      {afterHeader}
      {model.empty
        ? E.blank(model.empty)
        : model.rows.map((row) => (
          <Fragment key={row.key}>
            {E.row(
              row.title,
              row.detail,
              linkRows
                ? (
                  <span className="flex gap-2">
                    {E.act("Review", "primary", row.href)}
                    {row.shortfallHref ? E.act("Shortfall", "attention", row.shortfallHref) : null}
                  </span>
                )
                : E.act(row.verb, row.tone),
              row.warning ? "w" : "",
            )}
          </Fragment>
        ))}
      {footer}
    </>
  );
}
