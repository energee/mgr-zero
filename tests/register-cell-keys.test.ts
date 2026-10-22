// tests/register-cell-keys.test.ts — server-built register cells carry keys
// (#1137). Batches, Orders and Invoices build their cells in server
// components and hand them to the client RecordTable as an array prop, so
// React warns "Each child in a list should have a unique key" for any element
// cell without one. RecordTable's own index keys do not reach these elements.
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { RecordTableRow } from "../components/mgr/views/record-table";

/** Every row each RecordTable was handed, per inventory frame. */
const captured: RecordTableRow[][] = [];
vi.mock("../components/mgr/views/record-table", () => ({
  RECORD_LINK: "",
  RecordTable: ({ rows }: { rows: RecordTableRow[] }) => {
    captured.push(rows);
    return null;
  },
}));

const { SCREENS } = await import("../components/mgr/screens");

/** The element cells (and notes) a frame's registers were given. */
function elementCells(name: string) {
  captured.length = 0;
  renderToStaticMarkup(createElement("div", null, SCREENS.find((s) => s.name === name)!.body));
  return captured.flat().flatMap((row) => [...row.cells, row.note]).filter(isValidElement);
}

it.each(["Batches", "Orders", "Invoices"])("every element cell in the %s register has a key", (name) => {
  const cells = elementCells(name);
  expect(cells.length).toBeGreaterThan(0);
  const unkeyed = cells.filter((cell) => cell.key == null);
  expect(unkeyed.map((cell) => (typeof cell.type === "function" ? cell.type.name : String(cell.type)))).toEqual([]);
});
