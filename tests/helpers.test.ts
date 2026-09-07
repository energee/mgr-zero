// tests/helpers.test.ts — backend tests must not share the app database.
// `scripts/test-db.sh` starts a second local Supabase stack (project mgr_test,
// ports 5435x) and writes .env.test.local; vitest loads that over .env.local.
// Both the psql path (`sql`) and the supabase-js path (`admin`) must land on it.
import { describe, expect, it } from "vitest";
import { admin, DB, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, seedLocation, sql, TEST_DB_PORT } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

describe("test database isolation", () => {
  // CI has one fresh stack and no .env.test.local, so only the round trip runs there.
  it.skipIf(!process.env.MGR_TEST_STACK)("psql helper talks to the mgr_test stack, not the app stack", () => {
    expect(DB).toContain(`:${TEST_DB_PORT}/`);
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54351");
    expect(sql("select current_database()")[0]).toBe("postgres");
  });

  it("supabase-js and psql see the same rows", async () => {
    const b = await makeBrewery();
    expect(sql(`select name from breweries where id = '${b.id}'`)[0]).toBe(b.name);
    const { data } = await admin.from("breweries").select("id").eq("id", b.id).single();
    expect(data?.id).toBe(b.id);
  });
});

describe("seed helpers", () => {
  it("seedCatalog rows are visible to list_brands; seedLocation and seedCustomer link up", async () => {
    const b = await makeBrewery();
    const ctx = await makeStaffCtx(b.id);
    const { brandId, skuId } = await seedCatalog(b.id, { product: "Pils", sku: "Pils keg", packageType: "keg" });
    const brands = await runCommand("list_brands", {}, ctx) as { id: string; skus?: { id: string }[] }[];
    expect(brands.map(p => p.id)).toContain(brandId);
    expect(brands.find(p => p.id === brandId)?.skus?.map(s => s.id)).toContain(skuId);

    const loc = await seedLocation(b.id, { kind: "taproom" });
    expect(loc.kind).toBe("taproom");

    const { customerId, shipToId, priceListId } = await seedCustomer(b.id);
    const rows = sql(`select customer_id, brewery_id from ship_tos where id = '${shipToId}'`, true)[0].split("|");
    expect(rows).toEqual([customerId, b.id]);
    expect(sql(`select price_list_id from customers where id = '${customerId}'`)[0]).toBe(priceListId);
  });
});
