// tests/history-list-paging.test.ts — the Transfers, Packaging, Pick sheet and
// Batches lists return every row past PostgREST's 1000-row cap (#759). Pure:
// only the transport is a stub, capped at 1000 rows per response the way
// max_rows is; the registered commands, their filters and paging are real.
import { describe, expect, it } from "vitest";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Row = Record<string, unknown>;
const breweryId = "brewery";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);

function context(tables: Record<string, Row[]>, role: Ctx["role"]): Ctx {
  const db = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const order: { column: string; ascending: boolean }[] = [];
      let start = 0, end = Infinity, counted = false;
      const query = {
        select(_columns: string, options?: { count?: string }) { counted = options?.count === "exact"; return query; },
        eq(column: string, value: unknown) { rows = rows.filter(row => row[column] === value); return query; },
        in(column: string, values: unknown[]) { rows = rows.filter(row => values.includes(row[column])); return query; },
        is(column: string, value: null) { rows = rows.filter(row => row[column] === value); return query; },
        not(column: string, _op: "is", value: null) { rows = rows.filter(row => row[column] !== value); return query; },
        order(column: string, options?: { ascending?: boolean; referencedTable?: string }) {
          if (!options?.referencedTable) order.push({ column, ascending: options?.ascending ?? true });
          return query;
        },
        limit() { return query; },
        range(from: number, to: number) { start = from; end = to; return query; },
        then(resolve: (result: { data: Row[]; error: null; count: number | null }) => unknown) {
          rows.sort((a, b) => {
            for (const { column, ascending } of order) {
              const comparison = String(a[column]).localeCompare(String(b[column]));
              if (comparison) return ascending ? comparison : -comparison;
            }
            return 0;
          });
          return Promise.resolve(resolve({ data: rows.slice(start, Math.min(end + 1, start + 1000)), error: null, count: counted ? rows.length : null }));
        },
      };
      return query;
    },
  };
  return { db: db as unknown as Ctx["db"], userId: "staff", breweryId, role } as Ctx;
}

const many = (make: (n: number) => Row): Row[] => Array.from({ length: 1001 }, (_, n) => ({ brewery_id: breweryId, ...make(n) }));

describe("history lists page past 1000 rows (#759)", () => {
  it("list_stock_transfers returns every transfer, newest first", async () => {
    const transfers = many(n => ({ id: id(n), status: "draft", created_at: `${day(n)}T00:00:00Z`, stock_transfer_lines: [] }));
    const listed = await runCommand("list_stock_transfers", {}, context({ stock_transfers: transfers }, "warehouse")) as Row[];
    expect(listed).toHaveLength(1001);
    expect(listed[0].id).toBe(id(1000));
  });

  it("list_packaging_runs returns every run with its brand", async () => {
    const runs = many(n => ({ id: id(n), run_no: n, brand_id: id(0), occupancy_id: null, planned_on: day(n) }));
    const listed = await runCommand("list_packaging_runs", {}, context({
      packaging_runs: runs, brands: [{ id: id(0), name: "Pils", brewery_id: breweryId }],
    }, "warehouse")) as Row[];
    expect(listed).toHaveLength(1001);
    expect(listed[0]).toMatchObject({ id: id(1000), brand_name: "Pils" });
  });

  it("daily_pick_sheet without a date returns every confirmed and picked order", async () => {
    const orders = many(n => ({ id: id(n), status: n % 2 ? "picked" : "confirmed", requested_ship_date: day(n), order_lines: [] }));
    orders.push({ brewery_id: breweryId, id: id(5000), status: "shipped", requested_ship_date: day(0), order_lines: [] });
    const listed = await runCommand("daily_pick_sheet", {}, context({ orders }, "warehouse")) as Row[];
    expect(listed).toHaveLength(1001);
    expect(listed.at(-1)?.id).toBe(id(1000));
  });

  it("list_batches returns every batch, newest first", async () => {
    const batches = many(n => ({ id: id(n), planned_on: day(n), brewed_on: null, closed_at: null, intended_brand_id: null, recipe_version_id: null }));
    const listed = await runCommand("list_batches", {}, context({ batches }, "brewer")) as Row[];
    expect(listed).toHaveLength(1001);
    expect(listed[0].id).toBe(id(1000));
  });
});
