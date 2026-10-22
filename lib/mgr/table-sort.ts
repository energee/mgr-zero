// lib/mgr/table-sort.ts — what a table header click sorts by
// (docs/plans/data-table-sort.md). A cell becomes a plain sort value, two
// values compare as dates, figures, or natural text, and each table's last
// sort is kept in this browser's localStorage.
import { Fragment, isValidElement, type ReactNode } from "react";
import type { ColumnSort, SortingState } from "@tanstack/react-table";

/** A cell's sort value; null is an empty cell. A table's accessor returns
 *  undefined for null and its columns set `sortUndefined: "last"`, so empty
 *  cells sort last in both directions and never reach compareSortValues. */
export type SortValue = string | number | null;

/** A date as lib/date-format.ts formatDate prints it: "Sep 12, 2026". */
export const PRINTED_DATE = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/;
/** PRINTED_DATE at the end of a longer text, such as "Overdue Sep 12, 2026". */
const DATE_AT_END = new RegExp(PRINTED_DATE.source.slice(1));
/** A figure as the screens print one: "$1,040.00", "−$25.00", "12.5%". */
const FIGURE = /^[−-]?\$?[\d,]+(\.\d+)?%?$/;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** The text a node draws: host elements and fragments by their children. A
 *  function component's text is not in the tree, so it reads as "". */
function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(node) && (typeof node.type === "string" || node.type === Fragment)) return text(node.props.children);
  return "";
}

/** A cell's sort value: a number as is, otherwise its text, or null when it
 *  has none (a component cell's caller passes its own sort value). */
export function cellSortValue(cell: ReactNode): SortValue {
  if (typeof cell === "number") return cell;
  return text(cell).trim() || null;
}

function figure(value: string): number | undefined {
  const bare = value.replace(/\s/g, "");
  return FIGURE.test(bare) ? Number(bare.replace(/[$,%]/g, "").replace("−", "-")) : undefined;
}

/** Orders two non-empty values: both ending in a printed date by time, both
 *  figures by number, anything else as natural text ("B-9" before "B-12"). */
export function compareSortValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a);
  const y = String(b);
  const dates = [DATE_AT_END.exec(x)?.[0], DATE_AT_END.exec(y)?.[0]];
  if (dates[0] && dates[1]) return Date.parse(dates[0]) - Date.parse(dates[1]);
  const figures = [figure(x), figure(y)];
  if (figures[0] !== undefined && figures[1] !== undefined) return figures[0] - figures[1];
  return collator.compare(x, y);
}

/** One key per table: two tables with the same headers on a page share it. */
export const sortStorageKey = (pathname: string, headers: string[]) => `mgr-sort:${pathname}:${headers.join("|")}`;

const isColumnSort = (entry: unknown): entry is ColumnSort =>
  typeof entry === "object" && entry !== null && typeof (entry as ColumnSort).id === "string" && typeof (entry as ColumnSort).desc === "boolean";

/** The table's saved sort, or [] when there is none or it is malformed. */
export function readSavedSort(key: string): SortingState {
  // Blocked storage (a private window, no localStorage on the server) means no
  // saved sort, which is safe: the table draws in its default order.
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(saved) && saved.every(isColumnSort) ? saved : [];
  } catch {
    return [];
  }
}

/** Saves the table's sort; an empty sort removes the key. */
export function saveSort(key: string, sorting: SortingState): void {
  // A blocked write only loses the remembered sort; the table still sorts.
  try {
    if (sorting.length) localStorage.setItem(key, JSON.stringify(sorting));
    else localStorage.removeItem(key);
  } catch {}
}
