// components/mgr/views/finished-goods.tsx — Finished goods register, drawn by
// the shared RecordTable. The SKU name is each row's one link (SKU detail); a
// negative Available adds a Shortfall link under the figure. Live slots
// MovementForm as createAction, Add SKU after the header, and the movements
// ledger as footer.
import Link from "next/link";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RECORD_LINK, RecordTable } from "@/components/mgr/views/record-table";
import type { FinishedGoodsRowView, FinishedGoodsViewModel } from "@/lib/mgr/finished-goods-view";

export type { FinishedGoodsViewModel };

/** The Available figure. Negative stock is red and also says Shortfall in
 *  words, so color is never the only signal; that word links to replenishment. */
function Available({ row, shortfallHref }: { row: FinishedGoodsRowView; shortfallHref: string }) {
  if (!row.short) return row.atp;
  return (
    <span className="inline-flex flex-col items-end text-destructive">
      {row.atp}
      <Link href={shortfallHref} data-to="Pars and allocation" className={RECORD_LINK}>Shortfall</Link>
    </span>
  );
}

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
  /** Live: the name and Shortfall go to their pages. Inventory leaves the name
   *  an inert tap and Shortfall "#". Each names its screen in data-to, because
   *  tests/mgr-screens.test.ts requires it of every link whose text is not a
   *  screen name. */
  linkRows?: boolean;
}) {
  const to = (href: string) => (linkRows ? href : "#");
  return (
    <>
      {E.back("Beer", "Finished goods", createAction !== undefined ? createAction : E.btn("Add SKU"), model.backHref)}
      {model.valueLine !== undefined ? E.fld("Inventory value", model.valueLine) : null}
      {afterHeader}
      {model.empty ? E.blank(model.empty) : <RecordTable
        headers={["SKU", "On hand", "Allocated", "Available"]}
        align={["l", "r", "r", "r"]}
        rows={model.rows.map((row) => ({
          key: row.key,
          cells: [row.name, row.onHand, row.allocated, <Available key="available" row={row} shortfallHref={to(row.shortfallHref)} />],
          // Available is a component, so it sorts by its figure.
          sort: [row.name, row.onHand, row.allocated, row.atp],
          href: linkRows ? row.href : undefined,
          to: "SKU detail",
        }))}
      />}
      {footer}
    </>
  );
}
