// components/mgr/sort-table.tsx — E.tbl's drawing, a client component so its
// headers can sort the rows (components/mgr/sort-head.tsx). Screens stack in
// a flex column, so the wrapper must not shrink: Table's scroll box would
// collapse to one clipped line (#1037).
"use client";

import type { ReactNode } from "react";
import { SortHead, useSortedRows } from "@/components/mgr/sort-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { cellSortValue } from "@/lib/mgr/table-sort";

const alignClass = (align: "l" | "r" | undefined) => (align === "r" ? "text-right" : "text-left");
const cellValue = (row: ReactNode[], i: number) => cellSortValue(row[i]);

export function SortTable({ headers, rows: given, align, sortable = true }: { headers: ReactNode[]; rows: ReactNode[][]; align?: ("l" | "r")[]; sortable?: boolean }) {
  const { rows, columns } = useSortedRows(headers, given, cellValue, sortable);
  return (
    <div className="shrink-0">
      <Table className="min-w-max">
        <TableHeader>
          <TableRow>
            {headers.map((h, i) => (
              <SortHead key={i} sort={columns[i]} className={alignClass(align?.[i])}>{h}</SortHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            // Keyed by the row's given position, which a sort does not change.
            <TableRow key={given.indexOf(r)}>
              {r.map((c, j) => (
                <TableCell key={j} className={alignClass(align?.[j])}>{c}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
