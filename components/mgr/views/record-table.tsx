// components/mgr/views/record-table.tsx — comparable records (Catalog's brands,
// Formats, Finished goods, Batches, Invoices) drawn once for both surfaces: a
// table from md up, and on the phone a list of records separated by rules,
// each fact labeled by its column header. The first cell names the record and
// is its one link; it covers each whole record, so no row repeats an Open
// button. Without an href (the inventory) the name is an inert tap, the way
// E.act draws one. Other cells may hold any node, including their own links
// and actions, which sit above the covering link.
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type RecordTableRow = {
  key: string;
  /** cells[0] is the record's name; the rest line up under headers[1..].
   *  A null, undefined or false cell has nothing to say: its table cell is
   *  empty and the phone list leaves the labeled pair out. */
  cells: ReactNode[];
  /** A secondary line under the name, such as a brand's staff-only alias. */
  note?: ReactNode;
  /** Where the name links on a live page; the inventory leaves it out. */
  href?: string;
  /** The screen the name opens, when the name is a record rather than a
   *  screen name (data-to; tests/mgr-screens.test.ts resolves every link). */
  to?: string;
};

const alignClass = (a: "l" | "r" | undefined) => (a === "r" ? "text-right" : "text-left");
/** The one record link style: identity targets wrap and retain the shared
 *  48px minimum on coarse pointers. Other links in a register cell use it too. */
export const RECORD_LINK = "inline-flex min-h-6 min-w-0 max-w-full shrink items-center whitespace-normal wrap-anywhere text-left font-medium underline underline-offset-4 pointer-coarse:min-h-12";
// Links and actions inside a fact stay tappable above the name's whole-record cover.
const ABOVE_COVER = "[&_a]:relative [&_a]:z-10 [&_button]:relative [&_button]:z-10";
const said = (cell: ReactNode) => cell != null && cell !== false;

/** The name as a link (live) or a tap (inventory); it covers its whole record. */
function name(row: RecordTableRow) {
  const cls = cn(RECORD_LINK, "after:absolute after:inset-0");
  return row.href
    ? <Link href={row.href} data-to={row.to} className={cls}>{row.cells[0]}</Link>
    : <Button variant="link" type="button" data-tap data-to={row.to} className={cn(cls, "h-auto p-0 text-foreground")}>{row.cells[0]}</Button>;
}

export function RecordTable({ headers, align, rows }: {
  headers: ReactNode[];
  /** Per column: "l" for text, "r" for numbers. */
  align: ("l" | "r")[];
  rows: RecordTableRow[];
}) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header, index) => (
                <TableHead key={index} className={cn("whitespace-normal", alignClass(align[index]))}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key} className="relative [&>td]:align-baseline">
                <TableCell className={cn("whitespace-normal", alignClass(align[0]))}>
                  {name(row)}
                  {row.note && <p className="text-muted-foreground">{row.note}</p>}
                </TableCell>
                {row.cells.slice(1).map((cell, index) => (
                  <TableCell key={index} className={cn("whitespace-normal wrap-anywhere", ABOVE_COVER, alignClass(align[index + 1]))}>{cell}</TableCell>
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
              <ItemContent className="min-w-0">
                <ItemTitle className="min-w-0 max-w-full line-clamp-none wrap-anywhere">{name(row)}</ItemTitle>
                {row.note && <ItemDescription className="break-words">{row.note}</ItemDescription>}
                <dl className="mt-1 grid gap-2 text-sm">
                  {row.cells.slice(1).map((cell, i) => said(cell) && (
                    <div key={i} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
                      <dt className="text-muted-foreground">{headers[i + 1]}</dt>
                      <dd className={cn("min-w-0 break-words", ABOVE_COVER, alignClass(align[i + 1]))}>{cell}</dd>
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
