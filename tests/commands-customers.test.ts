// tests/commands-customers.test.ts — customer/ship-to/price-list CRUD commands.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let b: { id: string }, ctx: Awaited<ReturnType<typeof makeStaffCtx>>, skuId: string;

beforeAll(async () => {
  b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "sales");
  const { data: p } = await admin.from("products").insert({ brewery_id: b.id, name: "IPA" }).select().single();
  const { data: s } = await admin.from("skus").insert({ brewery_id: b.id, product_id: p!.id, name: "IPA case", package_type: "can", bbl_per_unit: 0.0645 }).select().single();
  skuId = s!.id;
});

describe("customer CRUD", () => {
  it("creates a price list, prices a sku, creates a customer on it, adds a ship-to", async () => {
    const pl = await runCommand("upsert_price_list", { name: "2026 wholesale" }, ctx) as { id: string };
    await runCommand("set_price", { priceListId: pl.id, skuId, unitPriceCents: 3400 }, ctx);
    const cust = await runCommand("upsert_customer", {
      name: "Green Bar", type: "retailer", state: "PA", priceListId: pl.id,
    }, ctx) as { id: string };
    await runCommand("upsert_ship_to", {
      customerId: cust.id, label: "Main", address1: "1 Main St", city: "Phila", state: "PA", zip: "19107",
    }, ctx);
    const got = await runCommand("get_customer", { customerId: cust.id }, ctx) as
      { customer: { name: string }; shipTos: unknown[] };
    expect(got.customer.name).toBe("Green Bar");
    expect(got.shipTos.length).toBe(1);
  });
  it("update via same command with id", async () => {
    const cust = await runCommand("upsert_customer", { name: "Old Name", type: "retailer", state: "PA" }, ctx) as { id: string };
    await runCommand("upsert_customer", { id: cust.id, name: "New Name", type: "retailer", state: "PA" }, ctx);
    const got = await runCommand("get_customer", { customerId: cust.id }, ctx) as { customer: { name: string } };
    expect(got.customer.name).toBe("New Name");
  });
});
