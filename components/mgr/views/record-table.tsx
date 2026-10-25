// components/mgr/views/record-table.tsx — comparable records (Catalog's brands,
// Formats, Finished goods, Batches, Orders, Invoices) drawn once for both surfaces: a
// table from md up, and on the phone a list of records separated by rules,
// each fact labeled by its column header. The first cell names the record and
// is its one link; it covers each whole record, so no row repeats an Open
// button. Without an href (the inventory) the name is an inert tap, the way
// E.act draws one; an href of null (a live page withholding the link) draws
// it as plain text. Other cells may hold any node, including their own links
// and actions, which sit above the covering link. Headers sort the rows
// (components/mgr/sort-head.tsx), and both surfaces draw the sorted order; the
// last sort is remembered per browser.
"use client";

import { Fragment, isValidElement, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortHead, useSortedRows } from "@/components/mgr/sort-head";
import { cellSortValue, PRINTED_DATE, unwrapLazy, type SortValue } from "@/lib/mgr/table-sort";
import { cn } from "@/lib/utils";

export type RecordTableRow = {
  key: string;
  /** cells[0] is the record's name; the rest line up under headers[1..].
   *  A null, undefined or false cell has nothing to say: its table cell is
   *  empty and the phone list leaves the labeled pair out.
   *  A server caller hands these (and its headers) across in an array prop,
   *  so every element cell needs its own key (#1137); wrap a keyless helper
   *  like E.act in `<Fragment key>`. */
  cells: ReactNode[];
  /** A secondary line under the name, such as a brand's staff-only alias. */
  note?: ReactNode;
  /** A fixed-size thumbnail before the name, such as a brand's COLA label. */
  media?: ReactNode;
  /** Where the name links on a live page; the inventory leaves it out (an
   *  inert tap). null: the live viewer may not open it, so the name is plain text. */
  href?: string | null;
  /** The screen the name opens, when the name is a record rather than a
   *  screen name (data-to; tests/mgr-screens.test.ts resolves every link). */
  to?: string;
  /** Sort values parallel to cells: sort[i] replaces cells[i]'s own text, for
   *  a component cell whose text is not in the tree (lib/mgr/table-sort.ts). */
  sort?: SortValue[];
};

const recordSortValue = (row: RecordTableRow, i: number): SortValue => (row.sort?.[i] !== undefined ? row.sort[i] : cellSortValue(row.cells[i]));

const alignClass = (a: "l" | "r" | undefined) => (a === "r" ? "text-right" : "text-left");
/** What a cell ends with: the cell itself, or a fragment's last child (an
 *  Overdue badge, then the date). Read through SSR's lazy wrapper (#1232). */
const lastPart = (given: ReactNode): ReactNode => {
  const cell = unwrapLazy(given);
  return isValidElement<{ children?: ReactNode }>(cell) && cell.type === Fragment ? [cell.props.children].flat().at(-1) : cell;
};
/** A table cell: text may wrap anywhere, but a number never breaks inside
 *  its value ("$1,040.0" / "0") and its digits line up down the column. A
 *  cell ending in a printed date never breaks either ("Sep 12," / "2026", #1037). */
const cellClass = (a: "l" | "r" | undefined, cell: ReactNode) => {
  const end = lastPart(cell);
  const whole = a === "r" || (typeof end === "string" && PRINTED_DATE.test(end));
  return cn(alignClass(a), whole ? "whitespace-nowrap" : "whitespace-normal wrap-anywhere", a === "r" && "tabular-nums");
};
/** The one record link style: identity targets wrap and retain the shared
 *  48px minimum on coarse pointers. Other links in a register cell use it too. */
export const RECORD_LINK = "inline-flex min-h-6 min-w-0 max-w-full shrink items-center whitespace-normal wrap-anywhere text-left font-medium underline underline-offset-4 pointer-coarse:min-h-12";
// Links and actions inside a fact stay tappable above the name's whole-record cover.
const ABOVE_COVER = "[&_a]:relative [&_a]:z-10 [&_button]:relative [&_button]:z-10";
const said = (cell: ReactNode) => cell != null && cell !== false;

/** The name as a link (live) or a tap (inventory); it covers its whole record.
 *  A live name without a link is plain text, so nothing looks tappable. */
function name(row: RecordTableRow) {
  const cls = cn(RECORD_LINK, "after:absolute after:inset-0");
  return row.href === null
    ? <span className="font-medium wrap-anywhere">{row.cells[0]}</span>
    : row.href
      ? <Link href={row.href} data-to={row.to} className={cls}>{row.cells[0]}</Link>
      : <Button variant="link" type="button" data-tap data-to={row.to} className={cn(cls, "h-auto p-0 text-foreground")}>{row.cells[0]}</Button>;
}

export function RecordTable({ headers, align, rows: given, sortable = true }: {
  headers: ReactNode[];
  /** Per column of the table, header and cells alike: "l" for text, "r" for
   *  numbers. The phone list starts every value at the left. */
  align: ("l" | "r")[];
  rows: RecordTableRow[];
  /** False keeps the rows in the given order with plain headers. */
  sortable?: boolean;
}) {
  const { rows, columns } = useSortedRows(headers, given, recordSortValue, sortable);
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header, index) => (
                <SortHead key={index} sort={columns[index]} className={cn("whitespace-normal", alignClass(align[index]))}>{header}</SortHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              // A thumbnail has no text baseline, so a row with one centers its cells.
              <TableRow key={row.key} className={cn("relative", row.media ? "[&>td]:align-middle" : "[&>td]:align-baseline")}>
                <TableCell className={cn("whitespace-normal", alignClass(align[0]))}>
                  <div className="flex items-center gap-3">
                    {row.media}
                    <div className="min-w-0">
                      {name(row)}
                      {row.note && <p className="text-muted-foreground">{row.note}</p>}
                    </div>
                  </div>
                </TableCell>
                {row.cells.slice(1).map((cell, index) => (
                  <TableCell key={index} className={cn(ABOVE_COVER, cellClass(align[index + 1], cell))}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ItemGroup className="gap-0 md:hidden">
        {rows.map((row, index) => (
          <Fragment key={row.key}>
            {index > 0 && <ItemSeparator className="my-0" />}
            <Item role="listitem" className="relative px-0">
              {row.media && <ItemMedia className="self-start">{row.media}</ItemMedia>}
              <ItemContent className="min-w-0">
                <ItemTitle className="min-w-0 max-w-full line-clamp-none wrap-anywhere">{name(row)}</ItemTitle>
                {row.note && <ItemDescription className="break-words">{row.note}</ItemDescription>}
                <dl className="mt-1 grid gap-2 text-sm">
                  {row.cells.slice(1).map((cell, i) => said(cell) && (
                    // Every value starts at one left edge, numbers too. The label never
                    // wraps and is at least 8.5rem; the value takes all but 9.5rem of the
                    // line, so a label wider than the label column pushes its value onto
                    // a full-width line of its own beneath it.
                    <div key={i} className="flex flex-wrap gap-x-3 gap-y-1">
                      <dt className="min-w-[8.5rem] whitespace-nowrap text-muted-foreground">{headers[i + 1]}</dt>
                      <dd className={cn("min-w-0 grow basis-[calc(100%-9.5rem)] break-words", ABOVE_COVER)}>{cell}</dd>
                    </div>
                  ))}
                </dl>
              </ItemContent>
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
    </>
  );
}
