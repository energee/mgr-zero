// tests/commands-customers.test.ts — customer/ship-to CRUD commands and the price grid's cells.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, channelId, makeBrewery, makeStaffCtx, seedCatalog, seedPriceGroup } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let b: { id: string }, ctx: Awaited<ReturnType<typeof makeStaffCtx>>, brandId: string, formatId: string, wholesale: string, group: string;

beforeAll(async () => {
  b = await makeBrewery();
  ctx = await makeStaffCtx(b.id, "sales");
  ({ brandId, formatId } = await seedCatalog(b.id));
  wholesale = await channelId(b.id, "Wholesale");
  group = await seedPriceGroup(b.id, "1", 1);
});

describe("customer CRUD", () => {
  it("prices a grid cell, creates a customer on that channel, adds a ship-to", async () => {
    await runCommand("upsert_brand", { id: brandId, name: "Green IPA", priceGroupId: group }, ctx);
    await runCommand("set_channel_price", { saleChannelId: wholesale, priceGroupId: group, formatId, unitPriceCents: 3400 }, ctx);
    const cust = await runCommand("upsert_customer", {
      name: "Green Bar", type: "retailer", state: "PA", saleChannelId: wholesale,
    }, ctx) as { id: string };
    await runCommand("upsert_ship_to", {
      customerId: cust.id, label: "Main", address1: "1 Main St", city: "Phila", state: "PA", zip: "19107",
    }, ctx);
    const got = await runCommand("get_customer", { customerId: cust.id }, ctx) as
      { customer: { name: string; sale_channels: { name: string } }; shipTos: unknown[] };
    expect(got.customer.name).toBe("Green Bar");
    expect(got.customer.sale_channels.name).toBe("Wholesale");
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
      saleChannelId: wholesale,
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
    const cust = await runCommand("upsert_customer", { name: "Old Name", type: "retailer", state: "PA", saleChannelId: wholesale }, ctx) as { id: string };
    await runCommand("upsert_customer", { id: cust.id, name: "New Name", type: "retailer", state: "PA", saleChannelId: wholesale }, ctx);
    const got = await runCommand("get_customer", { customerId: cust.id }, ctx) as { customer: { name: string } };
    expect(got.customer.name).toBe("New Name");
  });

  it("empty paymentTerms preserves the create default and an existing payment term", async () => {
    const created = await runCommand("upsert_customer", {
      name: "Default payment terms", type: "retailer", state: "PA", saleChannelId: wholesale, paymentTerms: "",
    }, ctx) as { id: string; payment_terms: string };
    expect(created.payment_terms).toBe("net30");

    const configured = await runCommand("upsert_customer", {
      name: "Configured payment terms", type: "retailer", state: "PA", saleChannelId: wholesale, paymentTerms: "net15",
    }, ctx) as { id: string; payment_terms: string };
    const updated = await runCommand("upsert_customer", {
      id: configured.id, name: "Configured payment terms", type: "retailer", state: "PA", saleChannelId: wholesale, paymentTerms: "",
    }, ctx) as { payment_terms: string };
    expect(updated.payment_terms).toBe("net15");
  });
});
