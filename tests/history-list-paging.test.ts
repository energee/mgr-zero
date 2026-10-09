// tests/history-list-paging.test.ts — the Transfers, Packaging, Pick sheet and
// Batches lists return every row past PostgREST's 1000-row cap (#759). Pure:
// only the transport is a stub (tests/capped-db.ts), capped at 1000 rows per
// response the way max_rows is; the registered commands, their filters and
// paging are real. Every row shares one date, so only the `id` tiebreak keeps
// the pages from overlapping or skipping rows.
import { describe, expect, it } from "vitest";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { cappedDb, type Row } from "./capped-db";

const breweryId = "brewery";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);

const context = (tables: Record<string, Row[]>, role: Ctx["role"]): Ctx =>
  ({ db: cappedDb(tables), userId: "staff", breweryId, role }) as Ctx;

const many = (make: (n: number) => Row): Row[] => Array.from({ length: 1001 }, (_, n) => ({ brewery_id: breweryId, ...make(n) }));

/** Exactly the 1001 rows numbered 0..1000, each once. */
const expectAllOnce = (listed: Row[]) => {
  expect(listed).toHaveLength(1001);
  expect(new Set(listed.map(row => row.id))).toEqual(new Set(Array.from({ length: 1001 }, (_, n) => id(n))));
};

describe("history lists page past 1000 rows (#759)", () => {
  it("list_stock_transfers returns every transfer, ties included", async () => {
    const transfers = many(n => ({ id: id(n), status: "draft", created_at: `${day(0)}T00:00:00Z`, stock_transfer_lines: [] }));
    expectAllOnce(await runCommand("list_stock_transfers", {}, context({ stock_transfers: transfers }, "warehouse")) as Row[]);
  });

  it("list_packaging_runs returns every run with its brand, ties included", async () => {
    const runs = many(n => ({ id: id(n), run_no: n, brand_id: id(0), occupancy_id: null, planned_on: day(0) }));
    const listed = await runCommand("list_packaging_runs", {}, context({
      packaging_runs: runs, brands: [{ id: id(0), name: "Pils", brewery_id: breweryId }],
    }, "warehouse")) as Row[];
    expectAllOnce(listed);
    expect(listed[0]).toMatchObject({ brand_name: "Pils" });
  });

  it("daily_pick_sheet without a date returns every confirmed and picked order", async () => {
    const orders = many(n => ({ id: id(n), status: n % 2 ? "picked" : "confirmed", requested_ship_date: day(0), order_lines: [] }));
    orders.push({ brewery_id: breweryId, id: id(5000), status: "shipped", requested_ship_date: day(0), order_lines: [] });
    expectAllOnce(await runCommand("daily_pick_sheet", {}, context({ orders }, "warehouse")) as Row[]);
  });

  it("daily_pick_sheet with a date returns every order on that date and none from another", async () => {
    const orders = many(n => ({ id: id(n), status: "confirmed", requested_ship_date: day(5), order_lines: [] }));
    orders.push({ brewery_id: breweryId, id: id(5000), status: "confirmed", requested_ship_date: day(6), order_lines: [] });
    expectAllOnce(await runCommand("daily_pick_sheet", { date: day(5) }, context({ orders }, "warehouse")) as Row[]);
  });

  it("list_batches returns every batch, ties included", async () => {
    const batches = many(n => ({ id: id(n), planned_on: day(0), brewed_on: null, closed_at: null, intended_brand_id: null, recipe_version_id: null }));
    expectAllOnce(await runCommand("list_batches", {}, context({ batches }, "brewer")) as Row[]);
  });

  it("list_batches({ open: true }) returns every brewed open batch and no closed or unbrewed one", async () => {
    const batches = many(n => ({ id: id(n), planned_on: day(0), brewed_on: day(0), closed_at: null, intended_brand_id: null, recipe_version_id: null }));
    batches.push(
      { brewery_id: breweryId, id: id(5000), planned_on: day(0), brewed_on: day(0), closed_at: `${day(1)}T00:00:00Z`, intended_brand_id: null, recipe_version_id: null },
      { brewery_id: breweryId, id: id(5001), planned_on: day(0), brewed_on: null, closed_at: null, intended_brand_id: null, recipe_version_id: null },
    );
    expectAllOnce(await runCommand("list_batches", { open: true }, context({ batches }, "brewer")) as Row[]);
  });
});
