// components/mgr/sort-head.tsx — header sorting shared by RecordTable and
// E.tbl (docs/plans/data-table-sort.md). useSortedRows orders a table's rows
// with TanStack Table and remembers the last sort in this browser; SortHead
// draws a sortable header as the shadcn Data Table button with an arrow.
"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  createSortedRowModel,
  functionalUpdate,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type SortDirection,
  type SortingState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { TableHead } from "@/components/ui/table";
import { cellSortValue, compareSortValues, readSavedSort, saveSort, sortStorageKey, type SortValue } from "@/lib/mgr/table-sort";

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() });
type Entry<Row> = { row: Row; values: SortValue[] };
/** The saved sort is read once per render; this table never needs a push
 *  when another tab saves, so there is nothing to subscribe to. */
const noSubscribe = () => () => {};
/** A sortable column's state for its header: its direction and the click. */
type ColumnSortControl = { sorted: false | SortDirection; toggle: () => void };

/** The rows in the chosen order, and each column's sort control (undefined
 *  when that column cannot sort). Before a sort is chosen the rows keep the
 *  order they came in, so the server render is unchanged. `sortValue` must be
 *  stable (module scope): the rows' sort values are memoized on it. */
export function useSortedRows<Row>(headers: ReactNode[], rows: Row[], sortValue: (row: Row, column: number) => SortValue, sortable = true) {
  const count = headers.length;
  const data = useMemo(() => rows.map((row) => ({ row, values: Array.from({ length: count }, (_, i) => sortValue(row, i)) })), [rows, count, sortValue]);
  const texts = headers.map((header) => String(cellSortValue(header) ?? ""));
  // A column sorts when it has a header to click and something to order.
  const sortableIds = texts.flatMap((text, i) => (sortable && text && data.some((entry) => entry.values[i] !== null) ? [String(i)] : [])).join(",");
  const columns = useMemo(() => Array.from({ length: count }, (_, i): ColumnDef<typeof features, Entry<Row>> => ({
    id: String(i),
    accessorFn: (entry) => entry.values[i] ?? undefined,
    enableSorting: sortableIds.split(",").includes(String(i)),
    sortUndefined: "last",
    sortFn: (a, b, id) => compareSortValues(a.getValue<string | number>(id), b.getValue<string | number>(id)),
  })), [count, sortableIds]);

  // Browser only: called from the client snapshot and the click handler.
  const storageKey = () => sortStorageKey(window.location.pathname, texts);
  // The server cannot read localStorage: it and hydration draw "[]" (the
  // default order), and the saved sort applies on the render after.
  const saved = useSyncExternalStore(noSubscribe, () => JSON.stringify(readSavedSort(storageKey())), () => "[]");
  // A click is kept here too, so sorting still works when storage is blocked.
  const [chosen, setChosen] = useState<SortingState>();
  const sorting = useMemo(() => chosen ?? (JSON.parse(saved) as SortingState).filter((sort) => sortableIds.split(",").includes(sort.id)), [chosen, saved, sortableIds]);

  const table = useTable({
    features,
    columns,
    data,
    state: { sorting },
    onSortingChange: (updater) => {
      const next = functionalUpdate(updater, sorting);
      setChosen(next);
      saveSort(storageKey(), next);
    },
    // Clicks go ascending, descending, then back to the default order.
    sortDescFirst: false,
    enableMultiSort: false,
  });
  return {
    rows: table.getRowModel().rows.map((row) => row.original.row),
    columns: Array.from({ length: count }, (_, i): ColumnSortControl | undefined => {
      const column = table.getColumn(String(i));
      return column?.getCanSort() ? { sorted: column.getIsSorted(), toggle: () => column.toggleSorting() } : undefined;
    }),
  };
}

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;
const ARROW = { asc: ArrowUp, desc: ArrowDown };

/** A header cell. With a sort control it is a ghost button whose arrow shows
 *  the direction; without one it draws exactly as a plain TableHead. */
export function SortHead({ sort, className, children }: { sort: ColumnSortControl | undefined; className?: string; children: ReactNode }) {
  if (!sort) return <TableHead className={className}>{children}</TableHead>;
  const Arrow = sort.sorted ? ARROW[sort.sorted] : ArrowUpDown;
  return (
    <TableHead className={className} aria-sort={sort.sorted ? ARIA_SORT[sort.sorted] : "none"}>
      {/* Cancel only the cell's 8px inset; a wider negative margin creates
          horizontal overflow even when the table itself fits.
          data-preview-action keeps inventory sorting on the same screen. */}
      <Button type="button" variant="ghost" size="sm" className="-mx-2 h-auto min-h-7 px-2 text-sm whitespace-normal" onClick={sort.toggle} data-preview-action>
        {children}
        <Arrow aria-hidden className={sort.sorted ? undefined : "text-muted-foreground"} />
      </Button>
    </TableHead>
  );
}
