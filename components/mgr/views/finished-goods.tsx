// components/mgr/views/finished-goods.tsx — Finished goods register, drawn by
// the shared RecordTable. The SKU name is each row's one link (SKU detail); a
// negative Available adds a Shortfall link under the figure. For a user who may
// record a movement, each active SKU's row ends with Record movement, the same
// deep link as SKU detail's header button (#1507). The header holds
// the page actions: live slots MovementForm as createAction beside Add SKU in
// Catalog (#1113) and Record taproom count (#1518), and the movements ledger
// as footer.
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { RECORD_LINK, RecordTable } from "@/components/mgr/views/record-table";
import type { FinishedGoodsRowView, FinishedGoodsViewModel } from "@/lib/mgr/finished-goods-view";

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
  addSkuHref,
  countHref,
  footer,
  linkRows,
}: {
  model: FinishedGoodsViewModel;
  /** Live: Record movement, or null for a user who may not record one; null
   *  also drops each row's Record movement. The inventory leaves it out and
   *  draws the header's and the rows' Record movement inert. */
  createAction?: ReactNode;
  /** Where Add SKU in Catalog goes; null hides it for a user who may not
   *  create a SKU. The inventory leaves it out and the button stays inert. */
  addSkuHref?: string | null;
  /** Where the header's Record taproom count goes (Weekly count records
   *  taproom stock only); null hides it when denied. The inventory leaves it
   *  out and the button stays inert. */
  countHref?: string | null;
  /** Live: movements ledger. Inventory omits this. */
  footer?: ReactNode;
  /** Live: the name and Shortfall go to their pages. Inventory leaves the name
   *  an inert tap and Shortfall "#". Each names its screen in data-to, because
   *  tests/mgr-screens.test.ts requires it of every link whose text is not a
   *  screen name. */
  linkRows?: boolean;
}) {
  const to = (href: string) => (linkRows ? href : "#");
  const record = createAction !== undefined ? createAction : E.btn("Record movement");
  // A reader who may do none of them gets a bare title, not an empty action row.
  const actions = record || countHref !== null || addSkuHref !== null
    ? <div className="flex flex-col gap-2 md:flex-row">{record}{countHref !== null && E.btn("Record taproom count", "g", countHref)}{addSkuHref !== null && E.btn("Add SKU in Catalog", "g", addSkuHref)}</div>
    : undefined;
  return (
    <>
      {E.back("Beer", "Finished goods", actions, model.backHref)}
      {model.valueLine !== undefined ? E.fld("Inventory value", model.valueLine) : null}
      {model.empty ? E.blank(model.empty) : <RecordTable
        // The action column needs no visible header: its button names the verb.
        headers={["SKU", "On hand", "Allocated", "Available", ...(record ? [<span key="action" className="sr-only">Record movement</span>] : [])]}
        align={["l", "r", "r", "r", "l"]}
        rows={model.rows.map((row) => ({
          key: row.key,
          cells: [
            row.name, row.onHand, row.allocated, <Available key="available" row={row} shortfallHref={to(row.shortfallHref)} />,
            // Rows offer Record movement whenever the header does.
            ...(record ? [row.movementHref && <Fragment key="action">{E.act("Record movement", "primary", linkRows ? row.movementHref : undefined)}</Fragment>] : []),
          ],
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
