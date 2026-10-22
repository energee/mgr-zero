// tests/register-cell-keys.test.ts — server-built register cells carry keys
// (#1137). Batches, Orders, Invoices and Finished goods build their headers
// and cells in server components and hand them to the client RecordTable as
// array props, so React warns "Each child in a list should have a unique key"
// for any element without one. RecordTable's own index keys do not reach them.
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import type { RecordTableRow } from "../components/mgr/views/record-table";

/** The headers and rows each RecordTable was handed, per inventory frame. */
const captured = vi.hoisted((): { headers: ReactNode[]; rows: RecordTableRow[] }[] => []);
vi.mock("../components/mgr/views/record-table", () => ({
  RECORD_LINK: "",
  RecordTable: ({ headers, rows }: { headers: ReactNode[]; rows: RecordTableRow[] }) => {
    captured.push({ headers, rows });
    return null;
  },
}));

/** The element headers, cells and notes a frame's registers were given. */
function elementParts(name: string) {
  const screen = SCREENS.find((s) => s.name === name);
  if (!screen) throw new Error(`no ${name} frame`);
  captured.length = 0;
  renderToStaticMarkup(createElement("div", null, screen.body));
  return captured
    .flatMap(({ headers, rows }) => [...headers, ...rows.flatMap((row) => [...row.cells, row.note])])
    .filter(isValidElement);
}

it.each(["Batches", "Orders", "Invoices", "Finished goods"])("every element header and cell in the %s register has a key", (name) => {
  const parts = elementParts(name);
  expect(parts.length).toBeGreaterThan(0);
  const unkeyed = parts.filter((part) => part.key == null);
  expect(unkeyed.map((part) => (typeof part.type === "function" ? part.type.name : String(part.type)))).toEqual([]);
});
