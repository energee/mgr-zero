// tests/commands-customers.test.ts — customer/ship-to CRUD commands and the price grid's cells.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, channelId, makeBrewery, makeStaffCtx, seedCatalog, seedPriceGroup, sql } from "./helpers";
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
    const options = await runCommand("list_customers", { includeShipTos: true }, ctx) as { id: string; shipTos: { id: string; label: string; is_default: boolean }[] }[];
    expect(options.find(row => row.id === cust.id)?.shipTos).toEqual([
      expect.objectContaining({ label: "Main", id: expect.any(String), is_default: expect.any(Boolean) }),
    ]);
    const plain = await runCommand("list_customers", {}, ctx) as Record<string, unknown>[];
    expect(plain.every(row => !("shipTos" in row))).toBe(true);
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

  it("omitted paymentTerms preserves the create default and an existing payment term", async () => {
    const created = await runCommand("upsert_customer", {
      name: "Default payment terms", type: "retailer", state: "PA", saleChannelId: wholesale,
    }, ctx) as { id: string; payment_terms: string };
    expect(created.payment_terms).toBe("net30");

    const configured = await runCommand("upsert_customer", {
      name: "Configured payment terms", type: "retailer", state: "PA", saleChannelId: wholesale, paymentTerms: "net15",
    }, ctx) as { id: string; payment_terms: string };
    const updated = await runCommand("upsert_customer", {
      id: configured.id, name: "Configured payment terms", type: "retailer", state: "PA", saleChannelId: wholesale,
    }, ctx) as { payment_terms: string };
    expect(updated.payment_terms).toBe("net15");
  });

  // #491: customer terms are the vendor list; the command and the table both refuse anything else.
  it("refuses a payment term outside due_on_receipt / net15 / net30", async () => {
    const input = { name: "Odd terms", type: "retailer", state: "PA", saleChannelId: wholesale };
    await expect(runCommand("upsert_customer", { ...input, paymentTerms: "Net 30" }, ctx)).rejects.toThrow();
    const direct = await ctx.db.rpc("upsert_customer", {
      p_brewery: b.id, p_id: null, p_name: "Odd terms", p_type: "retailer", p_state: "PA",
      p_sale_channel: wholesale, p_license_no: null, p_payment_terms: "net45",
      p_tax_treatment: null, p_request_id: crypto.randomUUID(),
    });
    expect(direct.error?.message).toMatch(/customers_payment_terms_check/);
  });
});

// #475: list_customers stopped at PostgREST's max_rows (1000), so the order
// picker, /customers and the import preview lost every customer past it.
describe("list_customers past the 1000-row cap", () => {
  it("returns every customer, alphabetical", async () => {
    const many = await makeBrewery();
    const staff = await makeStaffCtx(many.id, "sales");
    const channel = await channelId(many.id, "Wholesale");
    sql(`insert into customers (brewery_id, name, type, state, sale_channel_id)
      select '${many.id}', 'Customer ' || lpad(n::text, 4, '0'), 'retailer', 'PA', '${channel}'
      from generate_series(1, 1005) n`, true);
    const list = await runCommand("list_customers", {}, staff) as { name: string }[];
    expect(list).toHaveLength(1005);
    expect(list.at(0)?.name).toBe("Customer 0001");
    expect(list.at(-1)?.name).toBe("Customer 1005");
  }, 30_000);
});

// #424: list_channel_prices stopped at PostgREST's max_rows (1000), so the
// pricing grid showed real prices past it as unpriced.
describe("list_channel_prices past the 1000-row cap", () => {
  it("returns every cell", async () => {
    const many = await makeBrewery();
    const staff = await makeStaffCtx(many.id, "sales");
    const channel = await channelId(many.id, "Wholesale");
    const { formatId: format } = await seedCatalog(many.id);
    sql(`with g as (
        insert into price_groups (brewery_id, name, position)
        select '${many.id}', 'G' || n, n from generate_series(1, 1005) n returning id)
      insert into channel_prices (brewery_id, sale_channel_id, price_group_id, format_id, unit_price_cents)
      select '${many.id}', '${channel}', id, '${format}', 100 from g`, true);
    const cells = await runCommand("list_channel_prices", {}, staff) as unknown[];
    expect(cells).toHaveLength(1005);
    const narrowed = await runCommand("list_channel_prices", { saleChannelId: channel }, staff) as unknown[];
    expect(narrowed).toHaveLength(1005);
  }, 30_000);
});
