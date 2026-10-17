// components/mgr/views/record-table.tsx — comparable records (Catalog's brands,
// Formats) drawn once for both surfaces: a table from md up, and on the phone
// a list of records separated by rules, each fact labeled by its column header.
// The first cell names the record and is its one link, so no row repeats an
// Open button; on the phone that link covers the whole record.
import { Fragment } from "react";
import Link from "next/link";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type RecordTableRow = {
  key: string;
  /** cells[0] is the record's name; the rest line up under headers[1..]. */
  cells: string[];
  /** A secondary line under the name, such as a brand's staff-only alias. */
  note?: string;
  /** Where the name links on a live page; inventory leaves it out and the link stays "#". */
  href?: string;
};

const alignClass = (a: "l" | "r" | undefined) => (a === "r" ? "text-right" : "text-left");
// 24px tall at least (WCAG 2.5.8), underlined so the name reads as the link.
const LINK = "inline-flex min-h-6 items-center font-medium underline underline-offset-4";

export function RecordTable({ headers, align, rows }: {
  headers: string[];
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
              {headers.map((header, i) => <TableHead key={header} className={alignClass(align[i])}>{header}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="text-left">
                  <Link href={row.href ?? "#"} className={LINK}>{row.cells[0]}</Link>
                  {row.note && <p className="text-muted-foreground">{row.note}</p>}
                </TableCell>
                {row.cells.slice(1).map((cell, i) => <TableCell key={headers[i + 1]} className={alignClass(align[i + 1])}>{cell}</TableCell>)}
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
                <ItemTitle className="line-clamp-none break-words">
                  <Link href={row.href ?? "#"} className={cn(LINK, "after:absolute after:inset-0")}>{row.cells[0]}</Link>
                </ItemTitle>
                {row.note && <ItemDescription className="break-words">{row.note}</ItemDescription>}
                <dl className="mt-1 grid gap-2 text-sm">
                  {row.cells.slice(1).map((cell, i) => (
                    <div key={headers[i + 1]} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
                      <dt className="text-muted-foreground">{headers[i + 1]}</dt>
                      <dd className={cn("min-w-0 break-words", alignClass(align[i + 1]))}>{cell}</dd>
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
