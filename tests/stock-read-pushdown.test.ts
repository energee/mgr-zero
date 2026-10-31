import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, insertFixture, makeBrewery, makeStaff, seedCatalog, seedLocation, sql } from "./helpers";

type PlanNode = {
  "Relation Name"?: string;
  "Actual Rows": number;
  "Actual Loops": number;
  "Rows Removed by Filter"?: number;
  Plans?: PlanNode[];
};

function ledgerScans(plan: PlanNode): PlanNode[] {
  return [
    ...(plan["Relation Name"] === "inventory_movements" ? [plan] : []),
    ...(plan.Plans ?? []).flatMap(ledgerScans),
  ];
}

describe("filtered stock reads on a 50,000-movement ledger", () => {
  let brewery: { id: string };
  let staff: { id: string; email: string };
  let db: SupabaseClient<Database>;
  let target: { skuId: string; formatId: string };
  let reserved: { skuId: string };
  let closed: { skuId: string };
  let zero: { skuId: string };
  let warehouse: { id: string; binId: string };
  let taproom: { id: string; binId: string };

  beforeAll(async () => {
    brewery = await makeBrewery();
    staff = await makeStaff(brewery.id, ["warehouse", "taproom"]);
    db = await asUser(staff.email);
    target = await seedCatalog(brewery.id, { product: "Target" });
    reserved = await seedCatalog(brewery.id, { product: "Reserved only" });
    closed = await seedCatalog(brewery.id, { product: "Closed reservation only" });
    zero = await seedCatalog(brewery.id, { product: "Zero net stock" });
    warehouse = await seedLocation(brewery.id);
    taproom = await seedLocation(brewery.id, { name: "Taproom", uses: ["taproom"] });

    sql(`with brands as (
      insert into public.brands (brewery_id, name)
      select '${brewery.id}', 'Bulk ' || n from generate_series(1, 200) n returning id
    ), skus as (
      insert into public.skus (brewery_id, brand_id, format_id, name)
      select '${brewery.id}', id, '${target.formatId}', 'Bulk' from brands returning id
    )
    insert into public.inventory_movements (brewery_id, sku_id, location_id, bin_id, qty, type, created_by)
    select '${brewery.id}', s.id, '${warehouse.id}', '${warehouse.binId}',
      case when n % 5 = 0 then -1 else 1 end, 'adjustment', '${staff.id}'
    from skus s cross join generate_series(1, 250) n`, true);
    insertFixture("inventory_movements", [
      ...[10, -3].map(qty => ({ brewery_id: brewery.id, sku_id: target.skuId,
        location_id: warehouse.id, bin_id: warehouse.binId, qty, type: "adjustment", created_by: staff.id })),
      { brewery_id: brewery.id, sku_id: target.skuId, location_id: taproom.id,
        bin_id: taproom.binId, qty: 2, type: "opening_balance", created_by: staff.id },
      ...[1, -1].map(qty => ({ brewery_id: brewery.id, sku_id: zero.skuId,
        location_id: warehouse.id, bin_id: warehouse.binId, qty, type: "adjustment", created_by: staff.id })),
    ]);
    const allocations = await admin.from("allocations").insert([
      { brewery_id: brewery.id, sku_id: target.skuId, qty: 4, source: "taproom_standing", ref: taproom.id, status: "open" },
      { brewery_id: brewery.id, sku_id: reserved.skuId, qty: 2, source: "taproom_standing", ref: taproom.id, status: "open" },
      { brewery_id: brewery.id, sku_id: closed.skuId, qty: 20, source: "taproom_standing", ref: taproom.id, status: "released" },
    ]);
    expect(allocations.error).toBeNull();
    sql("analyze public.inventory_movements; analyze public.allocations", true);
  }, 120_000);

  // The shared test database resets only when migrations change, so the bulk
  // ledger would otherwise grow by 50,000 rows on every run.
  afterAll(() => {
    sql(`delete from public.inventory_movements
      where sku_id in (select id from public.skus where brewery_id = '${brewery.id}' and name = 'Bulk');
      delete from public.skus where brewery_id = '${brewery.id}' and name = 'Bulk';
      delete from public.brands where brewery_id = '${brewery.id}' and name like 'Bulk %'`, true);
  }, 60_000);

  it("preserves location totals, zero balances and reservations without movements", async () => {
    const stock = await db.from("on_hand").select("location_id, qty", { count: "exact" })
      .eq("brewery_id", brewery.id).eq("sku_id", target.skuId);
    expect(stock.error).toBeNull();
    expect(stock.count).toBe(2);
    expect(stock.data).toEqual(expect.arrayContaining([
      { location_id: warehouse.id, qty: 7 }, { location_id: taproom.id, qty: 2 },
    ]));
    const atp = await db.from("atp").select("sku_id, qty", { count: "exact" })
      .eq("brewery_id", brewery.id).in("sku_id", [target.skuId, reserved.skuId, closed.skuId, zero.skuId]);
    expect(atp.error).toBeNull();
    expect(atp.count).toBe(3);
    expect(atp.data).toEqual(expect.arrayContaining([
      { sku_id: target.skuId, qty: 5 }, { sku_id: reserved.skuId, qty: -2 }, { sku_id: zero.skuId, qty: 0 },
    ]));
  });

  for (const view of ["on_hand", "atp"] as const) {
    for (const multiple of [false, true]) {
      it(`${view} scans only requested SKU movements (${multiple ? "batch" : "single"})`, () => {
        const skuFilter = multiple ? `sku_id in ('${target.skuId}', '${reserved.skuId}')` : `sku_id = '${target.skuId}'`;
        const [result] = JSON.parse(sql(`begin;
          set local request.jwt.claim.sub = '${staff.id}';
          set local role authenticated;
          explain (analyze, buffers, format json)
          select * from public.${view} where brewery_id = '${brewery.id}' and ${skuFilter};
          rollback`, true).join("\n")) as { Plan: PlanNode }[];
        const scans = ledgerScans(result.Plan);
        expect(scans.length, "the ledger must be visible to the planner, not hidden in a definer function").toBeGreaterThan(0);
        const visited = scans.reduce((total, scan) => total +
          (scan["Actual Rows"] + (scan["Rows Removed by Filter"] ?? 0)) * scan["Actual Loops"], 0);
        expect(visited, "unrelated SKU movements must not be scanned before aggregation").toBeLessThan(100);
      });
    }
  }
});
