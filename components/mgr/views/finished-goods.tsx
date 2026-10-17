// components/mgr/views/finished-goods.tsx — Finished goods register: a desktop
// table and a labeled phone list drawn from the same rows. The SKU name is each
// row's one link (SKU detail); a negative Available adds a Shortfall link under
// the figure. Live slots MovementForm as createAction, Add SKU after the
// header, and the movements ledger as footer.
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Item, ItemContent, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FinishedGoodsRowView, FinishedGoodsViewModel } from "@/lib/mgr/finished-goods-view";

export type { FinishedGoodsViewModel };

const LINK = "font-medium underline underline-offset-4";

/** The Available figure. Negative stock is red and also says Shortfall in
 *  words, so color is never the only signal; that word links to replenishment. */
function Available({ row, shortfallHref }: { row: FinishedGoodsRowView; shortfallHref: string }) {
  if (!row.short) return row.atp;
  return (
    <span className="inline-flex flex-col items-end text-destructive">
      {row.atp}
      <Link href={shortfallHref} data-to="Pars and allocation" className={`inline-flex min-h-6 items-center ${LINK}`}>Shortfall</Link>
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
  /** Live: the name and Shortfall go to their pages. Inventory leaves them "#";
   *  their data-to names the screen the explorer opens. */
  linkRows?: boolean;
}) {
  const to = (href: string) => (linkRows ? href : "#");
  return (
    <>
      {E.back("Beer", "Finished goods", createAction !== undefined ? createAction : E.btn("Add SKU"), model.backHref)}
      {model.valueLine !== undefined ? E.fld("Inventory value", model.valueLine) : null}
      {afterHeader}
      {model.empty ? E.blank(model.empty) : <>
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Allocated</TableHead>
                <TableHead className="text-right">Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {model.rows.map((row) => (
                <TableRow key={row.key}>
                  {/* The link fills the cell, so the whole cell is its target. */}
                  <TableCell className="whitespace-normal p-0">
                    <Link href={to(row.href)} data-to="SKU detail" className={`flex min-h-10 items-center px-2 ${LINK}`}>{row.name}</Link>
                  </TableCell>
                  <TableCell className="text-right">{row.onHand}</TableCell>
                  <TableCell className="text-right">{row.allocated}</TableCell>
                  <TableCell className="text-right"><Available row={row} shortfallHref={to(row.shortfallHref)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ItemGroup className="md:hidden">
          {model.rows.map((row, i) => (
            <Fragment key={row.key}>
              {i > 0 ? <ItemSeparator /> : null}
              <Item role="listitem" className="px-0">
                <ItemContent>
                  <ItemTitle className="line-clamp-none">
                    <Link href={to(row.href)} data-to="SKU detail" className={`inline-flex min-h-6 items-center ${LINK}`}>{row.name}</Link>
                  </ItemTitle>
                  {E.fld("On hand", row.onHand)}
                  {E.fld("Allocated", row.allocated)}
                  {E.fld("Available", <Available row={row} shortfallHref={to(row.shortfallHref)} />)}
                </ItemContent>
              </Item>
            </Fragment>
          ))}
        </ItemGroup>
      </>}
      {footer}
    </>
  );
}
