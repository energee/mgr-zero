// tests/customer-country-alias.test.ts — a customer and a ship-to have a
// country (ISO alpha-2, default US); only a US one has a state, and street,
// city and zip are optional outside the US. A customer has one optional
// staff-only alias (docs/plans/lolev-orders.md, task 1). Database-backed:
// the RPCs, the CSV row import and the QuickBooks invoice address.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, channelId, makeBrewery, makeStaffCtx, sql } from "./helpers";
import { rawDatabase } from "./raw-database";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
type Customer = { id: string; name: string; country: string; state: string | null; alias: string | null };
type ShipTo = { id: string; country: string; state: string | null; address1: string | null; city: string | null; zip: string | null };
let breweryId: string;
let owner: Ctx;
let wholesale: string;

const R = () => crypto.randomUUID();
// The positional arguments every caller passed before country and alias existed.
const customerArgs = (o: Record<string, unknown> = {}) => ({
  p_brewery: breweryId, p_id: null, p_name: `Customer ${R()}`, p_type: "retailer", p_state: null,
  p_sale_channel: wholesale, p_license_no: null, p_payment_terms: null, p_tax_treatment: null, p_request_id: R(), ...o,
});
const upsertCustomer = (o: Record<string, unknown>) => rawDatabase(owner.db).rpc("upsert_customer", customerArgs(o));
const upsertShipTo = (o: Record<string, unknown>) => rawDatabase(owner.db).rpc("upsert_ship_to", {
  p_brewery: breweryId, p_id: null, p_label: "Main", p_address1: null, p_address2: null,
  p_city: null, p_state: null, p_zip: null, p_request_id: R(), ...o,
});
const importRows = async (kind: string, rows: Record<string, string>[]) => {
  const request = R();
  const begun = await owner.db.rpc("begin_csv_import", { p_brewery: breweryId, p_kind: kind, p_rows: rows, p_request_id: request });
  expect(begun.error).toBeNull();
  const out = [];
  for (let n = 0; n < rows.length; n++) {
    const row = await owner.db.rpc("import_csv_row", { p_brewery: breweryId, p_request_id: request, p_row_n: n });
    expect(row.error).toBeNull();
    out.push(row.data as { status: string; error?: string; result?: Customer });
  }
  return out;
};

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  owner = await makeStaffCtx(breweryId, "admin");
  wholesale = await channelId(breweryId, "Wholesale");
});

describe("customer country and state", () => {
  it("a JP customer saves with no state", async () => {
    const { data, error } = await upsertCustomer({ p_country: "JP" });
    expect(error).toBeNull();
    expect(data as Customer).toMatchObject({ country: "JP", state: null });
  });

  it("a US customer without a state is refused; with one it saves and defaults to US", async () => {
    expect((await upsertCustomer({ p_country: "US" })).error).not.toBeNull();
    expect((await upsertCustomer({})).error).not.toBeNull();
    const { data, error } = await upsertCustomer({ p_state: "PA" });
    expect(error).toBeNull();
    expect(data as Customer).toMatchObject({ country: "US", state: "PA" });
  });

  it("a foreign customer with a state, or a malformed country, is refused", async () => {
    expect((await upsertCustomer({ p_country: "JP", p_state: "PA" })).error).not.toBeNull();
    expect((await upsertCustomer({ p_country: "jp" })).error).not.toBeNull();
  });

  it("a legacy positional call replays its first result", async () => {
    const request = R();
    const args = customerArgs({ p_state: "PA", p_request_id: request });
    const first = await owner.db.rpc("upsert_customer", args as never);
    expect(first.error).toBeNull();
    const again = await owner.db.rpc("upsert_customer", args as never);
    expect(again.data).toEqual(first.data);
  });
});

describe("customer name direct RPC boundary (#1306)", () => {
  it.each([null, "", "   ", "\t\r\n", "\u00a0\u2003"])("refuses blank creates and edits with name %j", async name => {
    const visibleName = `Visible customer ${R()}`;
    const created = await upsertCustomer({ p_state: "PA", p_name: visibleName });
    expect(created.error).toBeNull();
    const saved = created.data as Customer;
    const before = await owner.db.from("customers").select("id", { count: "exact", head: true }).eq("brewery_id", breweryId);
    for (const id of [null, saved.id]) {
      const result = await upsertCustomer({ p_id: id, p_state: "PA", p_name: name });
      expect(result.error?.message).toBe("a customer name is required");
    }
    const after = await owner.db.from("customers").select("id", { count: "exact", head: true }).eq("brewery_id", breweryId);
    expect(after.count).toBe(before.count);
    const unchanged = await owner.db.from("customers").select("name").eq("id", saved.id).single();
    expect(unchanged.data?.name).toBe(visibleName);
  });

  it("trims creates and edits, preserves alias/country/terms, and replays the original raw payload", async () => {
    const args = customerArgs({ p_country: "JP", p_name: " \tGreen Bar\u00a0", p_alias: "Local account", p_payment_terms: "net15", p_tax_treatment: "export" });
    const created = await rawDatabase(owner.db).rpc("upsert_customer", args);
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({ name: "Green Bar", alias: "Local account", country: "JP", state: null, payment_terms: "net15", tax_treatment: "export" });
    const saved = created.data as Customer;
    const edited = await upsertCustomer({ p_id: saved.id, p_country: "JP", p_name: "\u2003New name\n", p_alias: saved.alias });
    expect(edited.error).toBeNull();
    expect(edited.data).toMatchObject({ id: saved.id, name: "New name", alias: saved.alias, payment_terms: "net15" });
    const replay = await rawDatabase(owner.db).rpc("upsert_customer", args);
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(created.data);
    const changedPayload = await rawDatabase(owner.db).rpc("upsert_customer", { ...args, p_name: "Green Bar" });
    expect(changedPayload.error).not.toBeNull();
    const current = await owner.db.from("customers").select("name").eq("id", saved.id).single();
    expect(current.data?.name).toBe("New name");
  });

  it("keeps the direct RPC tenant boundary while normalizing names", async () => {
    const created = await upsertCustomer({ p_state: "PA", p_name: `Tenant name ${R()}` });
    expect(created.error).toBeNull();
    const saved = created.data as Customer;
    const otherBrewery = await makeBrewery();
    const outsider = await makeStaffCtx(otherBrewery.id, "admin");
    const denied = await rawDatabase(outsider.db).rpc("upsert_customer", customerArgs({ p_id: saved.id, p_state: "PA", p_name: " Replaced name " }));
    expect(denied.error?.code).toBe("42501");
    const unchanged = await owner.db.from("customers").select("name").eq("id", saved.id).single();
    expect(unchanged.data?.name).toBe(saved.name);
  });
});

describe("customer alias", () => {
  it("saves, clears when an edit omits it, and refuses a blank", async () => {
    const { data, error } = await upsertCustomer({ p_state: "WA", p_alias: "Evergreen 'N Beer" });
    expect(error).toBeNull();
    const saved = data as Customer;
    expect(saved.alias).toBe("Evergreen 'N Beer");
    const edited = await upsertCustomer({ p_id: saved.id, p_name: saved.name, p_state: "WA" });
    expect(edited.error).toBeNull();
    expect((edited.data as Customer).alias).toBeNull();
    expect((await upsertCustomer({ p_state: "WA", p_alias: "" })).error).not.toBeNull();
    expect((await upsertCustomer({ p_state: "WA", p_alias: "   " })).error).not.toBeNull();
  });
});

describe("ship-to country", () => {
  it("a JP ship-to saves with only a label and a country", async () => {
    const customer = (await upsertCustomer({ p_country: "JP" })).data as Customer;
    const { data, error } = await upsertShipTo({ p_customer: customer.id, p_country: "JP" });
    expect(error).toBeNull();
    expect(data as ShipTo).toMatchObject({ country: "JP", state: null, address1: null, city: null, zip: null });
  });

  it("a US ship-to without a state is refused", async () => {
    const customer = (await upsertCustomer({ p_state: "PA" })).data as Customer;
    expect((await upsertShipTo({ p_customer: customer.id })).error).not.toBeNull();
    const ok = await upsertShipTo({ p_customer: customer.id, p_address1: "1 Main St", p_city: "Phila", p_state: "PA", p_zip: "19107" });
    expect(ok.error).toBeNull();
    expect((ok.data as ShipTo).country).toBe("US");
  });
});

describe("import_csv_row", () => {
  it("still creates a US customer from a file with no country column", async () => {
    const [row] = await importRows("customers", [{ name: `CSV US ${R()}`, type: "retailer", state: "PA", saleChannelId: wholesale }]);
    expect(row.status).toBe("committed");
    expect(row.result).toMatchObject({ country: "US", state: "PA", alias: null });
  });

  it("creates a JP customer with country and alias and no state; refuses a US row with no state", async () => {
    const [jp, us] = await importRows("customers", [
      { name: `CSV JP ${R()}`, type: "distributor", country: "JP", alias: "Tokyo account", saleChannelId: wholesale },
      { name: `CSV no state ${R()}`, type: "retailer", saleChannelId: wholesale },
    ]);
    expect(jp.status).toBe("committed");
    expect(jp.result).toMatchObject({ country: "JP", state: null, alias: "Tokyo account" });
    expect(us).toMatchObject({ status: "blocked", error: "state is required" });
  });

  it("creates a US ship-to with only a label and a state; refuses one with no state", async () => {
    const customer = (await upsertCustomer({ p_state: "OH" })).data as Customer;
    const [oh, none] = await importRows("ship_tos", [{ customerId: customer.id, label: "Main", state: "OH" }, { customerId: customer.id, label: "Dock" }]);
    expect(oh.status).toBe("committed");
    expect(oh.result).toMatchObject({ country: "US", state: "OH", address1: null, city: null, zip: null });
    expect(none).toMatchObject({ status: "blocked", error: "state is required" });
  });

  it("creates a JP ship-to with only a label and a country", async () => {
    const customer = (await upsertCustomer({ p_country: "JP" })).data as Customer;
    const [row] = await importRows("ship_tos", [{ customerId: customer.id, label: "Main", country: "JP" }]);
    expect(row.status).toBe("committed");
    expect(row.result).toMatchObject({ country: "JP", state: null });
  });
});

describe("QuickBooks invoice address", () => {
  it("sends the ship-to country and no state for a JP customer", async () => {
    const customer = (await upsertCustomer({ p_country: "JP" })).data as Customer;
    const shipTo = (await upsertShipTo({ p_customer: customer.id, p_country: "JP", p_address1: "1-1 Chiyoda", p_city: "Tokyo", p_zip: "100-0001", p_is_default: true })).data as ShipTo;
    expect(shipTo.country).toBe("JP");
    const realm = `realm-${R()}`;
    await admin.from("qbo_connections").insert({ brewery_id: breweryId, realm_id: realm, state: "connected" }).throwOnError();
    sql(`update public.customers set qbo_customer_id = 'jp-customer', qbo_realm_id = '${realm}' where id = '${customer.id}'`);
    const sku = await seedSku(realm);
    const invoice = (await admin.from("invoices").insert({ brewery_id: breweryId, customer_id: customer.id, issued_on: "2026-10-15" })
      .select("id").single().throwOnError()).data!.id;
    await admin.from("invoice_lines").insert({ brewery_id: breweryId, invoice_id: invoice, kind: "sku", sku_id: sku, qty: 1, unit_price_cents: 100, description: "Case" }).throwOnError();
    const pushed = await owner.db.rpc("start_qbo_push", { p_brewery: breweryId, p_invoice: invoice, p_new_attempt_reason: null, p_request_id: R() });
    expect(pushed.error).toBeNull();
    const body = JSON.parse((pushed.data as { requestBody: string }).requestBody) as { BillAddr: Record<string, string> };
    expect(body.BillAddr).toEqual({ Line1: "1-1 Chiyoda", City: "Tokyo", PostalCode: "100-0001", Country: "JP" });
  });
});

async function seedSku(realm: string) {
  const brand = (await admin.from("brands").insert({ brewery_id: breweryId, name: `Export lager ${R()}` }).select("id").single().throwOnError()).data!.id;
  const format = (await admin.from("formats").insert({ brewery_id: breweryId, name: `case ${R()}`, basis: "packaged", package_type: "can", bbl_per_unit: 0.0645 })
    .select("id").single().throwOnError()).data!.id;
  return (await admin.from("skus").insert({ brewery_id: breweryId, brand_id: brand, format_id: format, name: "Export lager case", qbo_item_id: "item-1", qbo_realm_id: realm })
    .select("id").single().throwOnError()).data!.id as string;
}
