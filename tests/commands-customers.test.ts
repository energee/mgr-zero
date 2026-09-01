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
  it("replays one customer mutation without creating a duplicate", async () => {
    const execution = {
      requestId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
    };
    const input = {
      name: `Replay customer ${execution.requestId}`,
      type: "retailer",
      state: "PA",
    };
    const first = await runCommand("upsert_customer", input, ctx, execution) as { id: string };
    const replay = await runCommand("upsert_customer", input, ctx, execution);
    expect(replay).toEqual(first);

    const rows = await admin.from("customers")
      .select("id")
      .eq("brewery_id", b.id)
      .eq("name", input.name);
    expect(rows.data).toHaveLength(1);
  });
  it("update via same command with id", async () => {
    const cust = await runCommand("upsert_customer", { name: "Old Name", type: "retailer", state: "PA" }, ctx) as { id: string };
    await runCommand("upsert_customer", { id: cust.id, name: "New Name", type: "retailer", state: "PA" }, ctx);
    const got = await runCommand("get_customer", { customerId: cust.id }, ctx) as { customer: { name: string } };
    expect(got.customer.name).toBe("New Name");
  });

  it("empty paymentTerms preserves the create default and an existing payment term", async () => {
    const created = await runCommand("upsert_customer", {
      name: "Default payment terms", type: "retailer", state: "PA", paymentTerms: "",
    }, ctx) as { id: string; payment_terms: string };
    expect(created.payment_terms).toBe("net30");

    const configured = await runCommand("upsert_customer", {
      name: "Configured payment terms", type: "retailer", state: "PA", paymentTerms: "net15",
    }, ctx) as { id: string; payment_terms: string };
    const updated = await runCommand("upsert_customer", {
      id: configured.id, name: "Configured payment terms", type: "retailer", state: "PA", paymentTerms: "",
    }, ctx) as { payment_terms: string };
    expect(updated.payment_terms).toBe("net15");
  });
});
