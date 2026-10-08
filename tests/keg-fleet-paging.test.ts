// Exercise the registered fleet query against capped PostgREST pages without a database.
import { describe, expect, it } from "vitest";
import { runCommand, type Ctx } from "@/lib/commands/registry";
import "@/lib/commands/taproom";

type Row = Record<string, string | number | boolean | null>;
const breweryId = "fleet-brewery";
const id = (n: number) => String(n).padStart(5, "0");

function fixture() {
  const tables: Record<string, Row[]> = {
    keg_pools: [], locations: [], bins: [], customers: [], keg_bin_on_hand: [], keg_customer_balances: [],
  };
  for (let n = 0; n < 1001; n++) {
    tables.keg_pools.push({ id: id(n), name: `Pool ${id(n)}`, active: n !== 1000 });
    tables.locations.push({ id: id(n), name: `Location ${id(n)}` });
    tables.bins.push({ id: id(n), name: `Bin ${id(n)}` });
    tables.customers.push({ id: id(n), name: `Customer ${id(n)}` });
    tables.keg_bin_on_hand.push({ pool_id: id(n), keg_size: "half_bbl", location_id: id(n), bin_id: id(n), qty: n === 1000 ? 0 : 2 });
    tables.keg_customer_balances.push({ customer_id: id(n), pool_id: id(n), keg_size: "half_bbl", qty: 3 });
  }
  // One customer's holdings cross both pool and size, including a later page.
  tables.keg_customer_balances.push({ customer_id: id(0), pool_id: id(1000), keg_size: "sixth_bbl", qty: 7 });
  tables.keg_customer_balances.push({ customer_id: "zero", pool_id: id(0), keg_size: "half_bbl", qty: 0 });
  tables.customers.push({ id: "zero", name: "Zero" });
  for (const rows of Object.values(tables)) for (const row of rows) row.brewery_id = breweryId;
  for (const rows of Object.values(tables)) rows.unshift({ ...rows[0], brewery_id: "other-brewery", id: "foreign", customer_id: "foreign", pool_id: "foreign", bin_id: "foreign", location_id: "foreign", name: "Foreign", qty: 99 });
  return tables;
}

// Only the transport is simulated: registry permissions, paging, joins and totals are real.
type PageRead = { table: string; order: string[] };
function context(tables: Record<string, Row[]>, failure?: { table: string; start: number; changed?: boolean }, reads?: PageRead[]): Ctx {
  const db = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const order: string[] = [];
      let start = 0, end = 999, counted = false;
      const query = {
        select(_columns: string, options?: { count: string }) { counted = options?.count === "exact"; return query; },
        eq(column: string, value: string) { rows = rows.filter(row => row[column] === value); return query; },
        order(column: string) { order.push(column); return query; },
        range(from: number, to: number) { start = from; end = to; return query; },
        then(resolve: (result: { data: Row[] | null; error: { message: string; code: string } | null; count: number | null }) => unknown) {
          reads?.push({ table, order: [...order] });
          rows.sort((a, b) => {
            for (const column of order) {
              const comparison = String(a[column]).localeCompare(String(b[column]));
              if (comparison) return comparison;
            }
            return 0;
          });
          const fails = failure?.table === table && failure.start === start;
          return Promise.resolve(resolve({
            data: fails && !failure.changed ? null : rows.slice(start, Math.min(end + 1, start + 1000)),
            error: fails && !failure.changed ? { message: "Read denied", code: "42501" } : null,
            count: counted ? rows.length + (fails && failure.changed ? 1 : 0) : null,
          }));
        },
      };
      return query;
    },
  };
  return { db: db as unknown as Ctx["db"], userId: "staff", breweryId, role: "warehouse" };
}

type Fleet = {
  pools: { id: string; active: boolean }[];
  rows: { pool_id: string; qty: number; location_name: string; bin_name: string }[];
  customers: { customer_id: string; name: string; kegs_out: number }[];
};
const fleet = (ctx: Ctx) => runCommand("get_keg_fleet", {}, ctx) as Promise<Fleet>;

describe("complete keg fleet (#726)", () => {
  it("sums every customer/pool/size combination, including a split customer and customers past the cap", async () => {
    const result = await fleet(context(fixture()));
    expect(result.customers.find(c => c.customer_id === id(0))).toMatchObject({ kegs_out: 10 });
    expect(result.customers).toHaveLength(1001);
    expect(result.customers.reduce((total, c) => total + c.kegs_out, 0)).toBe(3010);
    expect(result.customers.find(c => c.customer_id === id(1000))?.name).toBe("Customer 01000");
    expect(result.customers.some(c => c.customer_id === "zero" || c.customer_id === "foreign")).toBe(false);
  });

  it("keeps every pool and bin balance with complete location/bin names, including zero stock", async () => {
    const result = await fleet(context(fixture()));
    expect(result.pools).toHaveLength(1001);
    expect(result.pools.at(-1)).toMatchObject({ id: id(1000), active: false });
    expect(result.rows).toHaveLength(1001);
    expect(result.rows.at(-1)).toMatchObject({ qty: 0, location_name: "Location 01000", bin_name: "Bin 01000" });
    expect(result.rows.reduce((total, row) => total + row.qty, 0)).toBe(2000);
  });

  it.each(["keg_pools", "keg_bin_on_hand", "locations", "bins", "keg_customer_balances", "customers"])("fails explicitly when a later %s page fails", async table => {
    await expect(fleet(context(fixture(), { table, start: 500 }))).rejects.toThrow();
  });

  it("rejects changed totals rather than returning a partial fleet", async () => {
    await expect(fleet(context(fixture(), { table: "keg_customer_balances", start: 500, changed: true }))).rejects.toThrow(/changed while loading/);
  });

  it("orders every page by the full unique table or view grain", async () => {
    const reads: PageRead[] = [];
    await fleet(context(fixture(), undefined, reads));
    const expected: Record<string, string[]> = {
      keg_pools: ["name", "id"], keg_bin_on_hand: ["pool_id", "keg_size", "location_id", "bin_id"],
      locations: ["id"], bins: ["id"], keg_customer_balances: ["customer_id", "pool_id", "keg_size"], customers: ["id"],
    };
    expect(new Set(reads.map(read => read.table))).toEqual(new Set(Object.keys(expected)));
    for (const read of reads) expect(read.order, read.table).toEqual(expected[read.table]);
  });

  it("preserves empty-tenant results", async () => {
    expect(await fleet(context({}))).toEqual({ pools: [], rows: [], customers: [] });
  });

  it.each(["sales", "brewer", "taproom", "customer"] as const)("denies %s before reading fleet data", async role => {
    const reads: PageRead[] = [];
    await expect(fleet({ ...context(fixture(), undefined, reads), role })).rejects.toThrow(/permission/i);
    expect(reads).toEqual([]);
  });
});
