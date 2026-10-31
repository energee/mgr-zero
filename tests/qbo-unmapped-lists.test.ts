// tests/qbo-unmapped-lists.test.ts — list_customers, list_skus and list_vendors
// take `unmapped`: only rows with no QuickBooks id in the connected company
// (#1515). Database-backed: the predicate runs in the query, not the page.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog, seedCustomer, sql } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
const R = () => crypto.randomUUID();
let breweryId: string, owner: Ctx, realm: string;
const names = (rows: unknown) => (rows as { name: string }[]).map(row => row.name).sort();

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  owner = await makeStaffCtx(breweryId, "admin");
  realm = `realm-${R()}`;
  await admin.from("qbo_connections").insert({ brewery_id: breweryId, realm_id: realm, state: "connected" }).throwOnError();
  const mapped = await seedCustomer(breweryId, { name: "Mapped bar" });
  const stale = await seedCustomer(breweryId, { name: "Old company bar" });
  await seedCustomer(breweryId, { name: "New bar" });
  sql(`update public.customers set qbo_customer_id = '1', qbo_realm_id = '${realm}' where id = '${mapped.customerId}'`);
  sql(`update public.customers set qbo_customer_id = '2', qbo_realm_id = 'old-realm' where id = '${stale.customerId}'`);
  const sku = await seedCatalog(breweryId, { product: "Pils", sku: "Pils case" });
  await seedCatalog(breweryId, { product: "Stout", sku: "Stout case" });
  sql(`update public.skus set qbo_item_id = '7', qbo_realm_id = '${realm}' where id = '${sku.skuId}'`);
  await admin.from("vendors").insert([
    { brewery_id: breweryId, name: "Fieldstone Malt", qbo_vendor_id: "5", qbo_realm_id: realm },
    { brewery_id: breweryId, name: "Hop Farm" },
  ]).throwOnError();
});

describe("unmapped QuickBooks lists (#1515)", () => {
  it("keeps only rows with no id in the connected company", async () => {
    expect(names(await runCommand("list_customers", { unmapped: true }, owner))).toEqual(["New bar", "Old company bar"]);
    expect(names(await runCommand("list_skus", { unmapped: true }, owner))).toEqual(["Stout case"]);
    expect(names(await runCommand("list_vendors", { unmapped: true }, owner))).toEqual(["Hop Farm"]);
    expect(names(await runCommand("list_customers", {}, owner))).toHaveLength(3);
  });

  it("combines with a name search", async () => {
    expect(names(await runCommand("list_customers", { unmapped: true, q: "bar" }, owner))).toEqual(["New bar", "Old company bar"]);
    expect(names(await runCommand("list_customers", { unmapped: true, q: "new" }, owner))).toEqual(["New bar"]);
  });

  it("is refused to a role that cannot read the QuickBooks connection", async () => {
    const warehouse = await makeStaffCtx(breweryId, "warehouse");
    await expect(runCommand("list_skus", { unmapped: true }, warehouse)).rejects.toThrow(/permission denied/);
  });

  it("treats every row as unmapped when no company is connected", async () => {
    sql(`update public.qbo_connections set state = 'disconnected' where brewery_id = '${breweryId}'`);
    try {
      expect(names(await runCommand("list_vendors", { unmapped: true }, owner))).toEqual(["Fieldstone Malt", "Hop Farm"]);
    } finally {
      sql(`update public.qbo_connections set state = 'connected' where brewery_id = '${breweryId}'`);
    }
  });
});
