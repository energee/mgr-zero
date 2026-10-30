// tests/commands-customers.test.ts — customer/ship-to CRUD commands and the price grid's cells.
import { describe, it, expect, beforeAll } from "vitest";
import { admin, channelId, makeBrewery, makeStaffCtx, seedCatalog, seedPriceGroup, sql } from "./helpers";
import { getCommandDefinition, runCommand } from "../lib/commands/registry";
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
  it("refuses a ship-to label another of the customer's ship-tos uses, ignoring case and spaces, under Label (#1487)", async () => {
    const cust = await runCommand("upsert_customer", { name: `Dock Bar ${crypto.randomUUID()}`, type: "retailer", state: "PA", saleChannelId: wholesale }, ctx) as { id: string };
    const other = await runCommand("upsert_customer", { name: `Other Dock Bar ${crypto.randomUUID()}`, type: "retailer", state: "PA", saleChannelId: wholesale }, ctx) as { id: string };
    const dock = await runCommand("upsert_ship_to", { customerId: cust.id, label: "QA test dock", state: "PA" }, ctx) as { id: string };
    const message = "A ship-to labeled qa test dock already exists for this customer.";
    await expect(runCommand("upsert_ship_to", { customerId: cust.id, label: " qa test dock ", state: "PA" }, ctx))
      .rejects.toMatchObject({ status: 409, code: "conflict", message, issues: [{ path: ["label"], code: "duplicate", message }] });
    // The ship-to keeps its own label on edit, and another customer may use it.
    await runCommand("upsert_ship_to", { id: dock.id, customerId: cust.id, label: "QA test dock", state: "PA", zip: "15201" }, ctx);
    await runCommand("upsert_ship_to", { customerId: other.id, label: "QA test dock", state: "PA" }, ctx);
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

  it("saves trimmed names and refuses blank new writes after the request lookup (#1306)", async () => {
    const input = { name: " \tNamed account\n ", alias: "Staff alias", type: "retailer", state: "PA", saleChannelId: wholesale, paymentTerms: "net15", taxTreatment: "export" };
    const saved = await runCommand("upsert_customer", input, ctx) as { id: string; name: string; alias: string; payment_terms: string; tax_treatment: string };
    expect(saved).toMatchObject({ name: "Named account", alias: "Staff alias", payment_terms: "net15", tax_treatment: "export" });
    for (const name of ["", "   ", "\t\n", "\u00a0\u2003"]) {
      await expect(runCommand("upsert_customer", { ...input, name }, ctx)).rejects.toMatchObject({ status: 400, code: "invalid_input" });
      await expect(runCommand("upsert_customer", { ...input, id: saved.id, name }, ctx)).rejects.toMatchObject({ status: 400, code: "invalid_input" });
    }
    const current = await runCommand("get_customer", { customerId: saved.id }, ctx) as { customer: { name: string } };
    expect(current.customer.name).toBe("Named account");
  });

  it.each(["padded", "whitespace"])("replays a historical %s customer name through the command boundary (#1306)", async kind => {
    const requestId = crypto.randomUUID();
    const name = kind === "padded" ? ` Legacy account ${requestId} ` : "   ";
    const payload = JSON.stringify({
      brewery: b.id, id: null, name, type: "retailer", state: "PA", sale_channel: wholesale,
      license_no: null, payment_terms: null, tax_treatment: null,
    }).replaceAll("'", "''");
    // Reproduce the old RPC's committed row and raw request identity. The new
    // write guard must not prevent recovering either historical result.
    const committed = JSON.parse(sql(`
      select private.claim_command_request_for('${ctx.userId}', '${b.id}', 'upsert_customer', '${requestId}', '${payload}'::jsonb);
      insert into public.customers(brewery_id, name, type, state, sale_channel_id)
        values ('${b.id}', '${name}', 'retailer', 'PA', '${wholesale}');
      select private.complete_command_request_for('${ctx.userId}', '${requestId}',
        (select to_jsonb(c) from public.customers c where c.brewery_id = '${b.id}' and c.name = '${name}'));
    `, true).at(-1)!);
    const replay = await runCommand("upsert_customer", { name, type: "retailer", state: "PA", saleChannelId: wholesale }, ctx, {
      requestId, correlationId: crypto.randomUUID(),
    });
    expect(replay).toEqual(committed);
    const count = await ctx.db.from("customers").select("id", { count: "exact", head: true }).eq("brewery_id", b.id).eq("name", name);
    expect(count.count).toBe(1);
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

// docs/plans/lolev-orders.md task 2: a customer and a ship-to have a country,
// and only a US one needs a state; outside the US the address is optional.
describe("country, alias and search", () => {
  const parse = (command: string, value: Record<string, unknown>) => getCommandDefinition(command)!.input.safeParse(value);
  const customer = { name: "River Club", type: "distributor", saleChannelId: crypto.randomUUID() };
  it("upsert_customer takes a country without a state, needs a state for US, and refuses an unknown code", () => {
    expect(parse("upsert_customer", { ...customer, country: "CN" }).success).toBe(true);
    expect(parse("upsert_customer", { ...customer, country: "US" }).success).toBe(false);
    expect(parse("upsert_customer", customer).success).toBe(false);
    expect(parse("upsert_customer", { ...customer, state: "PA" }).success).toBe(true);
    expect(parse("upsert_customer", { ...customer, country: "CN", state: "PA" }).success).toBe(false);
    expect(parse("upsert_customer", { ...customer, country: "XX" }).success).toBe(false);
    expect(parse("upsert_customer", { ...customer, country: "CN", alias: "  " }).success).toBe(false);
  });
  // The user, 2026-10-15: an order needs only its country, or a US state; the
  // street, city and ZIP stay optional until known (docs/plans/lolev-orders.md).
  it("upsert_ship_to needs a label, plus a state in the US; street, city and ZIP are optional, a given US ZIP must be valid", () => {
    const shipTo = { customerId: crypto.randomUUID(), label: "Main" };
    expect(parse("upsert_ship_to", { ...shipTo, country: "JP" }).success).toBe(true);
    expect(parse("upsert_ship_to", { ...shipTo, country: "JP", zip: "100-0001" }).success).toBe(true);
    expect(parse("upsert_ship_to", shipTo).success).toBe(false);
    expect(parse("upsert_ship_to", { ...shipTo, state: "OH" }).success).toBe(true);
    expect(parse("upsert_ship_to", { ...shipTo, state: "OH", zip: "4411" }).success).toBe(false);
    expect(parse("upsert_ship_to", { ...shipTo, address1: "1 Main", city: "Phila", state: "PA", zip: "19107" }).success).toBe(true);
    expect(parse("upsert_ship_to", { ...shipTo, address1: "1 Main", city: "Phila", state: "PA", zip: "100-0001" }).success).toBe(false);
  });
  it("saves a foreign customer and ship-to with an alias; list_customers q matches the name or the alias", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const c = await runCommand("upsert_customer", { name: `Cedar Trading ${tag}`, alias: `Evergreen ${tag}`, type: "retailer", state: "WA", saleChannelId: wholesale }, ctx) as { id: string; alias: string };
    expect(c.alias).toBe(`Evergreen ${tag}`);
    const jp = await runCommand("upsert_customer", { name: `Maple ${tag}`, type: "distributor", country: "JP", saleChannelId: wholesale }, ctx) as { id: string; country: string; state: string | null };
    expect(jp).toMatchObject({ country: "JP", state: null });
    const st = await runCommand("upsert_ship_to", { customerId: jp.id, label: "Main", country: "JP" }, ctx) as { country: string; city: string | null };
    expect(st).toMatchObject({ country: "JP", city: null });
    const ids = async (q: string) => (await runCommand("list_customers", { q }, ctx) as { id: string }[]).map(r => r.id);
    expect(await ids(`evergreen ${tag}`)).toEqual([c.id]);
    expect(await ids(`Cedar Trading ${tag}`)).toEqual([c.id]);
    expect(await ids(tag)).toEqual([c.id, jp.id]);
    expect(await ids(`${tag}%`)).toEqual([]);
    expect(await ids(`Cedar Trading_${tag}`)).toEqual([]);
  });
  it("list_customers q treats * as literal text in the name and the alias (#1029)", async () => {
    const tag = crypto.randomUUID().slice(0, 8);
    const add = async (name: string, alias?: string) =>
      (await runCommand("upsert_customer", { name, alias, type: "retailer", state: "PA", saleChannelId: wholesale }, ctx) as { id: string }).id;
    const plain = await add(`Plain ${tag}`);
    const star = await add(`Star ${tag}*`);
    const aliased = await add(`Aliased ${tag}`, `Pint ${tag}*`);
    const comma = await add(`Comma ${tag}, (Inc)`);
    const ids = async (q: string) => (await runCommand("list_customers", { q }, ctx) as { id: string }[]).map(r => r.id);
    expect(await ids(`${tag}*`)).toEqual([aliased, star]);
    expect(await ids("*")).not.toContain(plain);
    expect(await ids(`${tag}, (inc`)).toEqual([comma]);
    const quote = await add(`Quote"Brand ${tag}`);
    const slash = await add(`Back\\Slash ${tag}`);
    expect(await ids(`e"B`)).toEqual([quote]);
    expect(await ids("k\\S")).toEqual([slash]);
  });
});
