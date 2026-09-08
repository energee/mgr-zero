import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { admin, asUser, channelId, makeBrewery, makeCustomerUser, makeStaffCtx } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let ctx: Awaited<ReturnType<typeof makeStaffCtx>>, breweryId: string, channel: string;
const address = { label: "Main", address1: "1 Main St", city: "Philadelphia", state: "PA", zip: "19107" };
async function customer() {
  return await runCommand("upsert_customer", { name: crypto.randomUUID(), type: "retailer", state: "PA", saleChannelId: channel }, ctx) as { id: string };
}
beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  ctx = await makeStaffCtx(breweryId, "sales");
  channel = await channelId(breweryId, "Wholesale");
});
describe("customer controls", () => {
  it("customer edit sends the prefilled tax override and preserves it on an unrelated name edit", async () => {
    const source = readFileSync("app/(app)/customers/customer-form.tsx", "utf8");
    expect(source).toContain("customer?.taxTreatment");
    expect(source).toMatch(/taxTreatment: taxTreatment/);
    const input = { name: "Export account", type: "retailer", state: "PA", saleChannelId: channel, taxTreatment: "export" };
    const saved = await runCommand("upsert_customer", input, ctx) as { id: string; tax_treatment: string };
    const updated = await runCommand("upsert_customer", { ...input, id: saved.id, name: "New name", taxTreatment: saved.tax_treatment }, ctx) as { tax_treatment: string };
    expect(updated.tax_treatment).toBe("export");
  });
  it("switches default atomically, preserves omitted choices, and replay cannot restore an old default", async () => {
    const c = await customer();
    const first = await runCommand("upsert_ship_to", { ...address, customerId: c.id, isDefault: true }, ctx) as { id: string; is_default: boolean };
    expect(first.is_default).toBe(true);
    const legacyEdit = await ctx.db.rpc("upsert_ship_to", {
      p_brewery: breweryId, p_id: first.id, p_customer: c.id, p_label: address.label,
      p_address1: address.address1, p_address2: null, p_city: address.city, p_state: address.state,
      p_zip: address.zip, p_request_id: crypto.randomUUID(),
    });
    expect(legacyEdit.error).toBeNull();
    expect(legacyEdit.data.is_default).toBe(true);
    const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    const input = { ...address, label: "Second", customerId: c.id, isDefault: true };
    const second = await runCommand("upsert_ship_to", input, ctx, execution) as { id: string };
    const updated = await runCommand("upsert_ship_to", { ...address, id: second.id, customerId: c.id }, ctx) as { is_default: boolean };
    expect(updated.is_default).toBe(true);
    await runCommand("upsert_ship_to", { ...address, id: first.id, customerId: c.id, isDefault: true }, ctx);
    expect(await runCommand("upsert_ship_to", input, ctx, execution)).toEqual(second);
    const { data, error } = await admin.from("ship_tos").select("id").eq("customer_id", c.id).eq("is_default", true);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: first.id }]);
    const plain = await runCommand("upsert_ship_to", { ...address, customerId: c.id }, ctx) as { is_default: boolean };
    expect(plain.is_default).toBe(false);
    await expect(runCommand("upsert_ship_to", { ...input, isDefault: false }, ctx, execution)).rejects.toThrow();
    const invalid = await ctx.db.rpc("upsert_ship_to", {
      p_brewery: breweryId, p_id: null, p_customer: c.id, p_label: "Invalid", p_address1: "1 Main", p_address2: null,
      p_city: "Town", p_state: "INVALID", p_zip: "19107", p_request_id: crypto.randomUUID(), p_is_default: true,
    });
    expect(invalid.error).not.toBeNull();
    const unchanged = await admin.from("ship_tos").select("id").eq("customer_id", c.id).eq("is_default", true);
    expect(unchanged.data).toEqual([{ id: first.id }]);
    const login = await makeCustomerUser(c.id);
    const portalCtx = { db: await asUser(login.email), userId: login.id, breweryId, role: "customer" as const, customerId: c.id };
    const account = await runCommand("get_portal_account", {}, portalCtx) as { shipTos: { id: string; is_default: boolean }[] };
    expect(account.shipTos.filter((s) => s.is_default).map((s) => s.id)).toEqual([first.id]);
    await runCommand("upsert_ship_to", { ...address, id: first.id, customerId: c.id, isDefault: false }, ctx);
    const cleared = await admin.from("ship_tos").select("id").eq("customer_id", c.id).eq("is_default", true);
    expect(cleared.data).toEqual([]);
  });
  it("direct RPC serializes concurrent defaults and rejects reassignment or another tenant without clearing the default", async () => {
    const c = await customer();
    const args = { p_brewery: breweryId, p_id: null, p_customer: c.id, p_label: "Concurrent", p_address1: address.address1, p_address2: null, p_city: address.city, p_state: address.state, p_zip: address.zip, p_is_default: true };
    const results = await Promise.all(Array.from({ length: 4 }, () => ctx.db.rpc("upsert_ship_to", { ...args, p_request_id: crypto.randomUUID() })));
    results.forEach((r) => expect(r.error).toBeNull());
    const defaults = await admin.from("ship_tos").select("id").eq("customer_id", c.id).eq("is_default", true);
    expect(defaults.error).toBeNull();
    expect(defaults.data).toHaveLength(1);
    const other = await customer();
    const reassigned = await ctx.db.rpc("upsert_ship_to", { ...args, p_id: defaults.data![0].id, p_customer: other.id, p_request_id: crypto.randomUUID() });
    expect(reassigned.error).not.toBeNull();
    const foreign = await makeBrewery();
    const foreignCtx = await makeStaffCtx(foreign.id);
    const crossed = await foreignCtx.db.rpc("upsert_ship_to", { ...args, p_brewery: foreign.id, p_request_id: crypto.randomUUID() });
    expect(crossed.error).not.toBeNull();
    const after = await admin.from("ship_tos").select("id").eq("customer_id", c.id).eq("is_default", true);
    expect(after.data).toEqual(defaults.data);
  });
  it("customer order filter combines with status and excludes sibling customer orders", async () => {
    const a = await customer(), b = await customer();
    const loc = await admin.from("locations").insert({ brewery_id: breweryId, name: "Warehouse", kind: "warehouse" }).select().single();
    expect(loc.error).toBeNull();
    for (const [customerId, status] of [[a.id, "draft"], [a.id, "submitted"], [b.id, "draft"]]) {
      const ship = await runCommand("upsert_ship_to", { ...address, customerId }, ctx) as { id: string };
      const row = await admin.from("orders").insert({ brewery_id: breweryId, kind: "wholesale", customer_id: customerId, ship_to_id: ship.id, from_location_id: loc.data.id, sale_channel_id: channel, created_by: ctx.userId, status });
      expect(row.error).toBeNull();
    }
    const orders = await runCommand("list_orders", { customerId: a.id, status: "draft" }, ctx) as { customer_id: string; status: string }[];
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ customer_id: a.id, status: "draft" });
  });
});

it("Settings reads and preserves the configured portal warehouse across unrelated brewery edits", async () => {
  const adminCtx = await makeStaffCtx(breweryId, "admin");
  const warehouse = await admin.from("locations").insert({ brewery_id: breweryId, name: "Portal warehouse", kind: "warehouse" }).select().single();
  expect(warehouse.error).toBeNull();
  await runCommand("set_portal_fulfillment_source", { locationId: warehouse.data.id }, adminCtx);
  await runCommand("update_brewery", { name: "Renamed", timezone: "America/New_York", readingDueHours: 24 }, adminCtx);
  const row = await runCommand("get_brewery", {}, adminCtx) as { portal_fulfillment_location_id: string };
  expect(row.portal_fulfillment_location_id).toBe(warehouse.data.id);
});
