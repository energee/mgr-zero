// Live, independently specified authorization matrix. Run only on tests/supabase.
import { sampleInput } from "@/lib/mgr/api-schema";
import { readFileSync } from "node:fs";
import { runCommand, listTools, getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, asUser, ins, makeBrewery, makeStaff, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";

// Adding an RLS table requires an explicit decision AND a nonempty fixture below.
// This is the approved read matrix, deliberately independent of taproom_can.
const matrix = {
  breweries: "deny", brewery_users: "self", brewery_counters: "deny", customer_users: "deny",
  customers: "deny", ship_tos: "deny", vendors: "deny", materials: "deny", material_lots: "deny",
  styles: "deny", price_groups: "deny", brands: "tenant", formats: "tenant", format_components: "tenant",
  keg_pools: "tenant", skus: "tenant", format_bom: "deny", locations: "taproom", bins: "taproom",
  sale_channels: "deny", channel_prices: "deny", inventory_movements: "deny", allocations: "deny",
  taproom_pars: "taproom", tap_intervals: "tenant", taproom_counts: "tenant", taproom_count_lines: "tenant", recipes: "deny", recipe_versions: "deny", recipe_ingredients: "deny",
  vessels: "deny", batches: "deny", vessel_occupancies: "deny", transfers: "deny", volume_adjustments: "deny", volume_adjustment_reclassifications: "deny",
  fermentation_readings: "deny", material_movements: "deny", batch_additions: "deny", packaging_runs: "deny",
  lots: "deny", packaging_run_outputs: "deny", packaging_run_consumptions: "deny", material_contracts: "deny",
  purchase_orders: "deny", purchase_order_lines: "deny", receipts: "deny", receipt_lines: "deny",
  material_counts: "deny", material_count_lines: "deny", orders: "deny", order_lines: "deny", order_deposit_lines: "deny", order_events: "deny",
  shipments: "deny", invoices: "deny", invoice_questions: "deny", invoice_lines: "deny", keg_events: "deny",
  stock_transfers: "deny", stock_transfer_lines: "deny", qbo_connections: "deny", qbo_pushes: "deny", pos_connections: "deny",
  pos_locations: "tenant", pos_item_mappings: "tenant", pos_sales: "deny", pos_sale_expectations: "deny", pos_sales_coverage: "deny", brand_approvals: "deny",
  state_registrations: "deny", brewery_state_licenses: "deny", report_filings: "deny", routes: "deny",
  deliveries: "deny", chat_installations: "deny", chat_user_links: "self", notification_destinations: "self",
  notification_preferences: "self", notification_occurrences: "deny", notification_deliveries: "deny",
  chat_callback_receipts: "deny", chat_action_intents: "deny",
} as const;
type Table = keyof typeof matrix;
type Row = Record<string, unknown>;
const compositeKeys: Partial<Record<Table, string[]>> = {
  brewery_users: ["brewery_id", "user_id"], brewery_counters: ["brewery_id", "key"],
  customer_users: ["customer_id", "user_id"], format_components: ["parent_format_id", "child_format_id"],
  format_bom: ["format_id", "material_id"], channel_prices: ["sale_channel_id", "price_group_id", "format_id"],
  taproom_pars: ["location_id", "sku_id"], pos_locations: ["connection_id", "external_location_id"],
  pos_item_mappings: ["connection_id", "external_item_id"], pos_sale_expectations: ["sale_id"],
};
const keys = (table: Table, rows: Row[]) => rows.map(row => JSON.stringify((compositeKeys[table] ?? ["id"]).map(k => row[k]))).sort();
// These tables intentionally have no authenticated SELECT privilege, in addition to RLS.
const serviceOnly = new Set<Table>(["brewery_counters", "volume_adjustment_reclassifications", "notification_occurrences", "notification_deliveries", "chat_callback_receipts", "chat_action_intents"]);
const day = "2026-09-08";
const now = "2026-09-08T12:00:00Z";

async function fixtures() {
  const brewery = await makeBrewery();
  const owner = await makeStaff(brewery.id, "admin");
  const taproom = await makeStaff(brewery.id, "taproom");
  const put = (table: Table, row: Row) => ins(table, { brewery_id: brewery.id, ...row });
  const cat = await seedCatalog(brewery.id);
  const wh = await seedLocation(brewery.id, { name: "Warehouse" });
  const taps = await Promise.all(["Tap A", "Tap B"].map(name => seedLocation(brewery.id, { name, kind: "taproom" })));
  const storage = await seedLocation(brewery.id, { name: "Storage", kind: "storage" });
  const customer = await seedCustomer(brewery.id);
  await ins("customer_users", { customer_id: customer.customerId, user_id: owner.id });
  const vendor = await put("vendors", { name: "Vendor" });
  const material = await put("materials", { name: "Malt", category: "malt", base_uom: "lb", purchase_uom: "lb" });
  await put("material_lots", { material_id: material.id, lot_code: "M1" });
  await put("styles", { name: "IPA" });
  const group = await put("price_groups", { name: "Standard", position: 1 });
  const composed = await put("formats", { name: "Six cases", basis: "packaged", package_type: "can" });
  await put("format_components", { parent_format_id: composed.id, child_format_id: cat.formatId, qty: 6 });
  await put("format_bom", { format_id: cat.formatId, material_id: material.id, qty_per_unit: 1 });
  const pool = await put("keg_pools", { name: "Fleet", kind: "owned" });
  await put("channel_prices", { sale_channel_id: customer.saleChannelId, price_group_id: group.id, format_id: cat.formatId, unit_price_cents: 1200 });
  for (const loc of [wh, ...taps, storage]) {
    await put("inventory_movements", { sku_id: cat.skuId, location_id: loc.id, bin_id: loc.binId, qty: 7, bbl: 7 * 0.0645, type: "opening_balance", created_by: owner.id });
    await put("taproom_pars", { location_id: loc.id, sku_id: cat.skuId, par_qty: 10 });
    await put("keg_events", { pool_id: pool.id, keg_size: "half_bbl", location_id: loc.id, bin_id: loc.binId, qty: 5, reason: "acquired", created_by: owner.id });
    await put("keg_events", { pool_id: pool.id, keg_size: "half_bbl", location_id: loc.id, bin_id: loc.binId, qty: 2, reason: "retired", created_by: owner.id });
  }
  for (const loc of taps) {
    await put("tap_intervals", { location_id: loc.id, label: "Guest fixture", nominal_bbl: .5, opening_fill: 1, not_in_inventory: true, opened_by: owner.id });
    const count = await put("taproom_counts", { location_id: loc.id, counted_on: day, counted_by: owner.id });
    await put("taproom_count_lines", { count_id: count.id, location_id: loc.id, bin_id: loc.binId, sku_id: cat.skuId, qty_before: 7, qty_counted: 7 });
  }
  // A negative and a zero group must survive aggregation exactly as before.
  await put("keg_events", { pool_id: pool.id, keg_size: "quarter_bbl", location_id: taps[0].id, bin_id: taps[0].binId, qty: 2, reason: "retired", created_by: owner.id });
  for (const reason of ["acquired", "retired"]) await put("keg_events", { pool_id: pool.id, keg_size: "sixth_bbl", location_id: taps[0].id, bin_id: taps[0].binId, qty: 1, reason, created_by: owner.id });
  const recipe = await put("recipes", { name: "IPA" });
  const version = await put("recipe_versions", { recipe_id: recipe.id, version: 1, created_by: owner.id });
  await put("recipe_ingredients", { recipe_version_id: version.id, material_id: material.id, per_bbl_qty: 1, stage: "mash" });
  const vessel = await put("vessels", { name: "FV1", kind: "fermenter", capacity_bbl: 10 });
  const vessel2 = await put("vessels", { name: "FV2", kind: "fermenter", capacity_bbl: 10 });
  const batch = await put("batches", { planned_on: day, planned_bbl: 10, intended_brand_id: cat.brandId, created_by: owner.id });
  const occupancy = await put("vessel_occupancies", { vessel_id: vessel.id, batch_id: batch.id, initial_bbl: 10 });
  const occupancy2 = await put("vessel_occupancies", { vessel_id: vessel2.id, batch_id: batch.id });
  await put("transfers", { from_occupancy_id: occupancy.id, to_occupancy_id: occupancy2.id, bbl: 1, created_by: owner.id });
  await put("volume_adjustments", { occupancy_id: occupancy.id, bbl: -1, reason: "loss", created_by: owner.id });
  await put("fermentation_readings", { occupancy_id: occupancy.id, gravity_plato: 5, created_by: owner.id });
  const consumption = await put("material_movements", { material_id: material.id, location_id: wh.id, bin_id: wh.binId, qty: -1, type: "consumption", created_by: owner.id });
  await put("batch_additions", { batch_id: batch.id, stage: "mash", movement_id: consumption.id });
  const run = await put("packaging_runs", { brand_id: cat.brandId, planned_on: day, created_by: owner.id });
  await put("lots", { packaging_run_id: run.id, brand_id: cat.brandId, code: "PRIVATE-LOT", packaged_on: day });
  await put("packaging_run_outputs", { run_id: run.id, sku_id: cat.skuId, qty_planned: 1 });
  await put("packaging_run_consumptions", { run_id: run.id, movement_id: consumption.id });
  await put("material_contracts", { vendor_id: vendor.id, material_id: material.id, qty_committed: 100 });
  const po = await put("purchase_orders", { vendor_id: vendor.id, status: "sent", sent_via: "external", created_by: owner.id });
  const poLine = await put("purchase_order_lines", { po_id: po.id, material_id: material.id, qty_ordered: 1 });
  const receipt = await put("receipts", { po_id: po.id, received_by: owner.id });
  sql(`insert into public.receipt_lines(brewery_id,receipt_id,po_line_id,qty_expected,qty_counted) values('${brewery.id}','${receipt.id}','${poLine.id}',1,1)`);
  const count = await put("material_counts", { location_id: wh.id, bin_id: wh.binId, counted_by: owner.id });
  await put("material_count_lines", { count_id: count.id, material_id: material.id, qty_expected: 1, qty_counted: 1 });
  const order = await put("orders", { kind: "wholesale", from_location_id: wh.id, customer_id: customer.customerId, ship_to_id: customer.shipToId, sale_channel_id: customer.saleChannelId, created_by: owner.id });
  const line = await put("order_lines", { order_id: order.id, sku_id: cat.skuId, qty_ordered: 1, unit_price_cents: 1200 });
  await put("order_deposit_lines", { order_id: order.id, order_line_id: line.id, keg_pool_id: pool.id, keg_size: "half_bbl", description: "Fleet deposit", qty_ordered: 1, unit_price_cents: 2500 });
  await put("allocations", { sku_id: cat.skuId, qty: 1, source: "order_line", ref: line.id });
  await put("order_events", { order_id: order.id, actor: owner.id, event: "created" });
  const shipment = await put("shipments", { order_id: order.id, created_by: owner.id });
  const invoice = await put("invoices", { customer_id: customer.customerId, kind: "invoice" });
  await put("invoice_questions", { invoice_id: invoice.id, customer_id: customer.customerId, body: "Private question", created_by: owner.id });
  await put("invoice_lines", { invoice_id: invoice.id, sku_id: cat.skuId, description: "IPA", qty: 1, unit_price_cents: 1200 });
  const transfer = await put("stock_transfers", { from_location_id: wh.id, to_location_id: taps[0].id, created_by: owner.id });
  await put("stock_transfer_lines", { transfer_id: transfer.id, sku_id: cat.skuId, qty: 1, from_bin_id: wh.binId, to_bin_id: taps[0].binId });
  const qboConnection = await put("qbo_connections", { realm_id: `realm-${brewery.id}` });
  await put("qbo_pushes", { invoice_id: invoice.id, connection_id: qboConnection.id, realm_id: `realm-${brewery.id}`,
    entity_type: "Invoice", provider_request_id: crypto.randomUUID(), request_body: "{}", local_snapshot: {}, attempt_reason: "initial" });
  const pos = await put("pos_connections", { merchant_id: `merchant-${brewery.id}` });
  await put("pos_locations", { connection_id: pos.id, external_location_id: "L1", location_id: taps[0].id });
  await put("pos_item_mappings", { connection_id: pos.id, external_item_id: "I1", sku_id: cat.skuId });
  const sale = await put("pos_sales", { connection_id: pos.id, external_order_id: "O1", external_line_id: "S1", external_item_id: "I1", external_location_id: "L1", sold_at: now, qty: 1 });
  sql(`select private.reconcile_pos_sale('${brewery.id}','${sale.id}')`);
  await put("pos_sales_coverage", { connection_id: pos.id, external_location_id: "L1", location_id: taps[0].id, starts_at: "2026-09-01T00:00:00Z", ends_at: now, complete: true });
  await put("brand_approvals", { brand_id: cat.brandId, kind: "cola", ttb_id: "PRIVATE-COLA" });
  await put("state_registrations", { brand_id: cat.brandId, state: "PA" });
  await put("brewery_state_licenses", { state: "PA", kind: "brewery" });
  await put("report_filings", { jurisdiction: "TTB", period_start: day, period_end: day, figures: { private: true } });
  const route = await put("routes", { delivery_date: day });
  await put("deliveries", { route_id: route.id, shipment_id: shipment.id, stop_no: 1 });
  const installation = await put("chat_installations", { provider: "slack", external_installation_id: brewery.id, display_label: "Fixture only", state: "active", installer_user_id: owner.id, token_store_key: `fixture-${brewery.id}` });
  let ownDestination = "";
  for (const user of [taproom, owner]) {
    await put("chat_user_links", { installation_id: installation.id, provider: "slack", external_user_id: user.id, user_id: user.id, state: "active" });
    const dest = await put("notification_destinations", { installation_id: installation.id, kind: "personal", external_destination_id: user.id, user_id: user.id, privacy_class: "direct" });
    await put("notification_preferences", { user_id: user.id, reason: "operations_digest", personal_destination_id: dest.id });
    if (user.id === taproom.id) ownDestination = dest.id;
  }
  await put("notification_destinations", { installation_id: installation.id, kind: "private_channel", external_destination_id: "shared", privacy_class: "private_internal" });
  const occurrence = await put("notification_occurrences", { reason: "operations_digest", subject_type: "brewery", subject_id: brewery.id, source_version: "1", occurred_at: now, owner_query: "digest", urgency: "normal", payload: { private: true }, semantic_key: "fixture" });
  await put("notification_deliveries", { occurrence_id: occurrence.id, destination_id: ownDestination, installation_id: installation.id, provider: "slack", semantic_key: "fixture" });
  await put("chat_callback_receipts", { installation_id: installation.id, provider: "slack", callback_id: "fixture", callback_kind: "action", disposition: "ignored", payload_hash: "fixture", received_at: now });
  await put("chat_action_intents", { installation_id: installation.id, user_id: taproom.id, provider: "slack", action_origin_hash: "fixture", command_name: "get_gravity_unit", input_hash: "fixture", subject_type: "brewery", subject_id: brewery.id, subject_version: "1", request_id: crypto.randomUUID(), preview_token_hash: "fixture", allowed_action: "confirm", expires_at: "2099-01-01T00:00:00Z" });
  sql(`update batches set brewed_on='${day}' where id='${batch.id}'`, true);
  const ownerCtx = { breweryId: brewery.id, userId: owner.id, role: "admin" as const, db: await asUser(owner.email) };
  const completed = await runCommand("complete_batch", { batchId: batch.id }, ownerCtx) as { adjustmentId: string };
  await runCommand("reattribute_loss", { adjustmentId: completed.adjustmentId, bbl: 0.01, classification: "destruction" }, ownerCtx);
  return { brewery, owner, taproom, taps, wh, storage, pool, customer, cat, vendor, material, recipe, version, batch, vessel, occupancy, run, po, poLine, order, line, invoice, transfer, installation, occurrence, composed };
}

type Fixture = Awaited<ReturnType<typeof fixtures>>;
async function tenantRows(db: SupabaseClient, table: Table, f: Fixture) {
  // The installation table grants health columns only; querying secrets would test ACL, not row scope.
  let query = db.from(table).select(table === "chat_installations" ? "id,brewery_id,state" : "*");
  if (table === "breweries") query = query.eq("id", f.brewery.id);
  else if (table === "customer_users") query = query.eq("customer_id", f.customer.customerId);
  else query = query.eq("brewery_id", f.brewery.id);
  const result = await query;
  if (db !== admin && serviceOnly.has(table)) {
    expect(result.error?.code, `${table} service-only ACL`).toBe("42501");
    expect(result.data).toBeNull();
    return [];
  }
  expect(result.error, `${table} query`).toBeNull();
  return result.data as unknown as Row[];
}

describe("taproom complete public RLS read boundary", () => {
  let own: Fixture, foreign: Fixture, db: SupabaseClient;
  beforeAll(async () => {
    // A pre-bootstrap database fails here for the actual missing enum value.
    own = await fixtures();
    foreign = await fixtures();
    db = await asUser(own.taproom.email);
  }, 120_000);

  it("classifies every public RLS table explicitly", () => {
    const tables = sql("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity and c.relkind in ('r','p') order by c.relname");
    expect(tables).toEqual(Object.keys(matrix).sort());
  });

  for (const table of Object.keys(matrix) as Table[]) {
    it(`${table}: nonempty service positive control, exact own scope, no foreign rows`, async () => {
      const positive = await tenantRows(admin, table, own);
      const otherPositive = await tenantRows(admin, table, foreign);
      expect(positive.length, `${table} owned fixture missing`).toBeGreaterThan(0);
      expect(otherPositive.length, `${table} foreign fixture missing`).toBeGreaterThan(0);
      const scope = matrix[table];
      const allowed = positive.filter(row => scope === "tenant" ||
        (scope === "self" && row.user_id === own.taproom.id) ||
        (scope === "taproom" && own.taps.some(t => t.id === (table === "locations" ? row.id : row.location_id))));
      if (scope !== "deny") expect(allowed.length, `${table} allowed positive control missing`).toBeGreaterThan(0);
      expect(keys(table, await tenantRows(db, table, own))).toEqual(keys(table, allowed));
      expect(await tenantRows(db, table, foreign)).toEqual([]);
    });
  }

  it("preserves private brewery and full own-tenant keg reads for the original four roles", async () => {
    for (const role of ["admin", "sales", "warehouse", "brewer"] as const) {
      const staff = role === "admin" ? own.owner : await makeStaff(own.brewery.id, role);
      const client = await asUser(staff.email);
      const brewery = await client.from("breweries").select("id,settings,ttb_registry_no");
      expect(brewery.error).toBeNull();
      expect(brewery.data).toEqual([{ id: own.brewery.id, settings: {}, ttb_registry_no: null }]);
      for (const result of [await client.from("keg_bin_on_hand").select("*"), await client.rpc("keg_bin_on_hand_rows")]) {
        expect(result.error).toBeNull();
        expect(result.data).toHaveLength(6);
        expect(result.data.every((row: Row) => row.brewery_id === own.brewery.id)).toBe(true);
        expect(result.data.filter((row: Row) => row.keg_size === "half_bbl").map((row: Row) => row.location_id).sort())
          .toEqual([own.wh.id, own.storage.id, ...own.taps.map(t => t.id)].sort());
        expect(result.data.filter((row: Row) => row.keg_size === "half_bbl").map((row: Row) => row.qty)).toEqual([3, 3, 3, 3]);
      }
    }
  });

  it("team list is empty for taproom", async () => {
    const team = await db.rpc("list_team_members", { p_brewery: own.brewery.id });
    expect(team.error).toBeNull();
    expect(team.data).toEqual([]);
  });

  it("projects only safe brewery columns through both view and direct function", async () => {
    const expected = [{ id: own.brewery.id, name: own.brewery.name, timezone: "America/New_York", gravity_unit: "plato" }];
    const view = await db.from("staff_brewery").select("*");
    const direct = await db.rpc("staff_brewery_rows");
    expect(view.error).toBeNull(); expect(direct.error).toBeNull();
    expect(view.data).toEqual(expected); expect(direct.data).toEqual(expected);
  });

  it("on-hand view and helper expose only taproom-location quantities", async () => {
    const expected = own.taps.map(t => ({ brewery_id: own.brewery.id, sku_id: own.cat.skuId, location_id: t.id, qty: 7 }));
    const sort = (rows: Row[]) => rows.sort((a, b) => String(a.location_id).localeCompare(String(b.location_id)));
    for (const result of [await db.from("on_hand").select("*"), await db.rpc("on_hand_rows")]) {
      expect(result.error).toBeNull();
      expect(sort(result.data)).toEqual(sort(expected));
    }
  });

  it("keg view and direct helper expose exactly six columns and allowed positive/negative/zero groups", async () => {
    const expected = own.taps.map(t => ({ brewery_id: own.brewery.id, pool_id: own.pool.id, keg_size: "half_bbl", location_id: t.id, bin_id: t.binId, qty: 3 }));
    expected.push(...[{ keg_size: "quarter_bbl", qty: -2 }, { keg_size: "sixth_bbl", qty: 0 }].map(r => ({ brewery_id: own.brewery.id, pool_id: own.pool.id, location_id: own.taps[0].id, bin_id: own.taps[0].binId, ...r })));
    const sort = (rows: Row[]) => rows.sort((a, b) => `${a.bin_id}:${a.keg_size}`.localeCompare(`${b.bin_id}:${b.keg_size}`));
    for (const result of [await db.from("keg_bin_on_hand").select("*"), await db.rpc("keg_bin_on_hand_rows")]) {
      expect(result.error).toBeNull();
      expect(sort(result.data)).toEqual(sort(expected));
    }
  });
});

// Existing real lifecycle matrix covers the other writes; this complements it,
// rather than treating an invalid resource ID as proof of role authorization.
it("classifies and rejects every remaining tenant RPC using owned resources", async () => {
  const f = await fixtures(); const db = await asUser(f.taproom.email);
  const B = f.brewery.id, W = f.wh.id, BIN = f.wh.binId, SKU = f.cat.skuId, BRAND = f.cat.brandId, MAT = f.material.id, VENDOR = f.vendor.id, I = f.installation.id;
  const R = () => crypto.randomUUID(); const name = `deny-${R()}`;
  const emptyVessel = await ins("vessels", { brewery_id: B, name, kind: "fermenter", capacity_bbl: 10 });
  const plannedBatch = await ins("batches", { brewery_id: B, planned_bbl: 2, planned_on: day, created_by: f.owner.id });
  const emptyBin = (await admin.from("bins").select("id").eq("location_id", W).eq("name", "Dry").single()).data!.id;
  const readyRun = await ins("packaging_runs", { brewery_id: B, brand_id: BRAND, planned_on: day, created_by: f.owner.id, started_at: now, occupancy_id: f.occupancy.id });
  await ins("packaging_run_outputs", { brewery_id: B, run_id: readyRun.id, sku_id: SKU, qty_planned: 1 });
  const draftPo = await ins("purchase_orders", { brewery_id: B, vendor_id: VENDOR, created_by: f.owner.id });
  await ins("purchase_order_lines", { brewery_id: B, po_id: draftPo.id, material_id: MAT, qty_ordered: 1 });
  const sentPo = await ins("purchase_orders", { brewery_id: B, vendor_id: VENDOR, created_by: f.owner.id, status: "sent", sent_via: "external" });
  const sentLine = await ins("purchase_order_lines", { brewery_id: B, po_id: sentPo.id, material_id: MAT, qty_ordered: 1 });
  const submitted = await ins("stock_transfers", { brewery_id: B, from_location_id: W, to_location_id: f.taps[0].id, created_by: f.owner.id, status: "submitted" });
  const transferLine = await ins("stock_transfer_lines", { brewery_id: B, transfer_id: submitted.id, sku_id: SKU, qty: 1, from_bin_id: BIN, to_bin_id: f.taps[0].binId });
  const parentSku = await ins("skus", { brewery_id: B, brand_id: BRAND, format_id: f.composed.id, name });
  await ins("inventory_movements", { brewery_id: B, sku_id: parentSku.id, location_id: W, bin_id: BIN, qty: 1, type: "opening_balance", created_by: f.owner.id });
  const contract = (await admin.from("material_contracts").select("id").eq("brewery_id", B).single()).data!.id;
  const delivery = (await admin.from("notification_deliveries").select("id").eq("brewery_id", B).single()).data!.id;
  const importRequest = R(), inviteRequest = R(), failureRequest = R();
  const importRows = [{ skuId: SKU, locationId: W, binId: BIN, qty: "1" }];
  const authUser = await admin.auth.admin.createUser({ email: `${R()}@test.local`, email_confirm: true });
  expect(authUser.error).toBeNull();
  sql(`insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash,result)
    values('${f.taproom.id}','${B}','${importRequest}','import_csv',decode('00','hex'),'${JSON.stringify({ kind: "opening_balances", rows: importRows })}');
    insert into private.invite_requests(brewery_id,actor_id,email,kind,role,auth_user_id,state,request_id)
    values('${B}','${f.taproom.id}','${inviteRequest}@test.local','staff','warehouse','${authUser.data.user!.id}','pending_membership','${inviteRequest}'),
      ('${B}','${f.taproom.id}','${failureRequest}@test.local','staff','warehouse','${authUser.data.user!.id}','pending_membership','${failureRequest}');`);
  expect(sql(`select count(*) from private.command_requests where actor_id='${f.taproom.id}' and request_id='${importRequest}' and result->'rows' <> '[]'::jsonb`)).toEqual(["1"]);
  expect(sql(`select count(*) from private.invite_requests where actor_id='${f.taproom.id}' and request_id in ('${inviteRequest}','${failureRequest}')`)).toEqual(["2"]);
  const reversible = await ins("inventory_movements", { brewery_id: B, sku_id: SKU, location_id: W, bin_id: BIN, qty: 1, type: "adjustment", created_by: f.owner.id });
  const cases: Record<string, unknown[]> = {
    reverse_inventory_movement: [B,reversible.id,"Wrong entry",R()],
    preview_inventory_movement: [B,SKU,W,BIN,1,"adjustment",null,null,null,null,R()],
    set_brewery_operating_defaults: [B,24,R()], begin_csv_import: [B,"opening_balances",importRows,R()], import_csv_row: [B,importRequest,0],
    claim_invite_request: [B,`${name}@test.local`,"staff","warehouse",null,R()], complete_invite_membership: [inviteRequest], record_invite_failure: [failureRequest],
    record_keg_event: [B,f.pool.id,"half_bbl",1,"acquired",W,BIN,null,null,R()], update_keg_pool: [B,f.pool.id,name,null,null,0,true,R()], create_keg_pool: [B,name,"owned",null,null,0,R()],
    begin_chat_installation: [B,"slack","https://example.test/chat/callback","state",R()], begin_chat_reauthorization: [B,I,"https://example.test/chat/callback","state",R()],
    begin_qbo_oauth: [B,"https://example.test/qbo/callback","state","connect",R(),["com.intuit.quickbooks.accounting"]], begin_qbo_invoice_sync: [B,R()],
    close_packaging_run: [B,readyRun.id,0.0645,[{sku_id:SKU,qty_actual:1}],name,day,null,W,BIN,R()],
    complete_batch: [B,f.batch.id,R()],
    reattribute_loss: [B,(await admin.from("volume_adjustments").select("id").eq("brewery_id", B).eq("reason", "loss").limit(1).single()).data!.id,0.01,"destruction",null,R()],
    create_purchase_order: [B,VENDOR,day,null,[{material_id:MAT,qty_ordered:1,unit_cost_cents:100}],R()], create_recipe: [B,BRAND,name,null,R()],
    create_recipe_version: [B,f.recipe.id,152,0.75,0.75,60,40,null,[{material_id:MAT,per_bbl_qty:1,stage:"mash"}],R()],
    delete_bin: [B,emptyBin,R()], disable_chat_installation: [B,I,R()], disconnect_chat_installation: [B,I,R()], draft_purchase_order_from_requirements: [B,[MAT],R()],
    portal_create_order: [B,f.customer.customerId,f.customer.shipToId,null,null,[{sku_id:SKU,qty:1}],R(),day],
    portal_quote_order: [B,f.customer.customerId,f.customer.shipToId,day,null,null,[{sku_id:SKU,qty:1}],R()],
    portal_submit_quote: [B,f.customer.customerId,R(),null,R()],
    receive_purchase_order: [B,sentPo.id,W,BIN,day,[{po_line_id:sentLine.id,qty_counted:1}],R()],
    record_brew_day: [B,plannedBatch.id,emptyVessel.id,2,day,R()], record_cellar_transfer: [B,f.occupancy.id,emptyVessel.id,1,0,R()],
    record_fermentation_reading: [B,f.occupancy.id,now,68,5,4.2,null,R()], record_material_count: [B,W,BIN,day,[{material_id:MAT,qty:1}],R()],
    record_repack: [B,W,BIN,parentSku.id,1,SKU,6,R()], record_stock_transfer_pick: [submitted.id,[{line_id:transferLine.id,qty:1}],R()], record_submitted_order_occurrence: [f.order.id],
    schedule_batch: [B,BRAND,f.version.id,day,2,null,R()], schedule_packaging_run: [B,BRAND,day,f.occupancy.id,[{sku_id:SKU,qty_planned:1}],R()], send_purchase_order: [B,draftPo.id,"external",R()],
    set_brewery_gravity_unit: [B,"sg",R()], set_brewery_quiet_hours: [B,I,"22:00","07:00",R()], set_portal_fulfillment_source: [B,W,R()], submit_stock_transfer: [f.transfer.id,R()],
    set_qbo_customer_mapping: [B,f.customer.customerId,"qbo-customer",R()], set_qbo_item_mapping: [B,SKU,"qbo-item",R()],
    set_qbo_deposit_mapping: [B,"qbo-deposit",R()], set_qbo_push_defaults: [B,true,true,R()], start_qbo_push: [B,f.invoice.id,"initial",R()], write_off_invoice: [B,f.invoice.id,"Fixture",R()],
    set_personal_quiet_hours: [B,"22:00","07:00","America/New_York",R()], snooze_notification: [B,delivery,new Date(Date.now()+3600000).toISOString(),R()],
    generate_compliance_report: [B,"TTB",day,day], get_chat_integration_health: [B], list_chat_user_links: [B],
    update_bin: [B,emptyBin,name,R()], update_location: [B,W,name,"warehouse",R()], update_sku: [B,SKU,true,null,R()], raise_invoice_question: [B,f.invoice.id,"Fixture question",R()],
    update_packaging_run: [B,readyRun.id,f.occupancy.id,[{sku_id:SKU,qty_planned:1}],now,R()], upsert_material: [B,MAT,"Malt","malt","lb","lb",1,false,VENDOR,0,true,R()],
    upsert_material_contract: [B,contract,VENDOR,MAT,100,100,day,null,name,R()], upsert_vendor: [B,VENDOR,"Vendor",null,null,1,"net30",true,R()], upsert_vessel: [B,emptyVessel.id,name,"fermenter",10,R()],
  };
  const catalog = sql(`select json_build_object('name',p.proname,'signature',p.oid::regprocedure::text,'args',p.proargnames[1:p.pronargs]) from pg_proc p
    where p.pronamespace='public'::regnamespace and has_function_privilege('authenticated',p.oid,'execute')
      and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')`).map(row => JSON.parse(row) as {name:string;signature:string;args:string[]});
  const readNames = ["get_batch_completion_preview","get_loss_review","get_taproom_draft_projection","get_taproom_variance","list_open_taps","list_tap_history","get_taproom_count_snapshot","get_taproom_print_labels","get_taproom_count","list_taproom_counts","taproom_can","staff_brewery_rows","keg_bin_on_hand_rows","on_hand_rows","get_chat_integration_health","get_chat_link_intent","list_chat_user_links","generate_compliance_report","get_today_items","is_staff_of","my_brewery_ids","my_customer_ids","portal_availability","portal_brewery_rows","staff_role","today_live_reasons","list_team_members","list_chat_conversations","get_chat_history"];
  const ownNames = ["set_my_gravity_unit","consume_chat_link_proof","unlink_chat_user","set_notification_preference","set_personal_notification_destination","create_chat_conversation","append_chat_message"];
  const existing = [...readFileSync(new URL("./rls-command-boundary.test.ts", import.meta.url), "utf8").matchAll(/rpc: "(\w+)"/g)].map(m => m[1]);
  const infrastructureNames = ["consume_command_admission"];
  expect([...new Set(catalog.map(c => c.name))].sort()).toEqual([...new Set([...Object.keys(cases),...existing,...readNames,...ownNames,...infrastructureNames,"provision_brewery"])].sort());
  const publicSnapshot = () => sql((Object.keys(matrix) as Table[]).map(table => {
    const predicate = table === "breweries" ? `id='${B}'` : table === "customer_users" ? `customer_id='${f.customer.customerId}'` : `brewery_id='${B}'`;
    return `select '${table}:' || md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'')) from public.${table} t where ${predicate}`;
  }).join(";"));
  const publicBefore = publicSnapshot();
  const readSignatures = ["get_batch_completion_preview(uuid,uuid)","get_loss_review(uuid,date,date)","get_taproom_draft_projection(uuid,uuid)","get_taproom_variance(uuid,uuid,integer)","list_open_taps(uuid,uuid)","list_tap_history(uuid,uuid)","get_taproom_count_snapshot(uuid,uuid)","get_taproom_print_labels(uuid,uuid,text)","get_taproom_count(uuid,uuid)","list_taproom_counts(uuid,uuid)","taproom_can(uuid,text)","staff_brewery_rows()","keg_bin_on_hand_rows()","on_hand_rows()","get_chat_integration_health(uuid)","get_chat_link_intent(uuid,text)","list_chat_user_links(uuid)","generate_compliance_report(uuid,text,date,date)","get_today_items(uuid,timestamp with time zone)","is_staff_of(uuid)","my_brewery_ids()","my_customer_ids()","portal_availability(uuid)","portal_brewery_rows()","staff_role(uuid)","today_live_reasons()","list_team_members(uuid)","list_chat_conversations(uuid)","get_chat_history(uuid,uuid)"];
  const ownSignatures = ["set_my_gravity_unit(uuid,text,uuid)","consume_chat_link_proof(uuid,text,uuid)","unlink_chat_user(uuid,uuid,uuid)","set_notification_preference(uuid,text,boolean,time without time zone,time without time zone,text,boolean,uuid)","set_personal_notification_destination(uuid,text,uuid,uuid)","create_chat_conversation(uuid,text,uuid)","append_chat_message(uuid,uuid,text,text,uuid)"];
  expect(catalog.filter(c => readNames.includes(c.name)).map(c => c.signature).sort()).toEqual(readSignatures.sort());
  expect(catalog.filter(c => ownNames.includes(c.name)).map(c => c.signature).sort()).toEqual([...ownSignatures].sort());
  expect(catalog.filter(c => c.name === "provision_brewery").map(c => c.signature)).toEqual(["provision_brewery(text,text,text,uuid)"]);
  expect(catalog.filter(c => infrastructureNames.includes(c.name)).map(c => c.signature)).toEqual(["consume_command_admission()"]);
  await expect(db.rpc("consume_command_admission")).resolves.toMatchObject({ data: [{ allowed: true, retry_after: 0 }], error: null });
  for (const name of new Set(existing)) expect(catalog.filter(c => c.name === name), `${name} existing lifecycle case`).toHaveLength(1);
  const sharedDestination = await db.rpc("set_notification_destination", { p_brewery: B, p_installation: I, p_external_destination_id: "shared", p_request_id: R(), p_actor: f.owner.id, p_version: now });
  expect(sharedDestination.error?.code).toBe("42501");
  const before = sql(`select md5(string_agg(row_to_json(t)::text,'' order by request_id)) from private.command_requests t where brewery_id='${B}';
    select md5(string_agg(row_to_json(t)::text,'' order by request_id)) from private.invite_requests t where brewery_id='${B}'`);
  const qboGenericPermission = new Set(["begin_qbo_oauth","begin_qbo_invoice_sync","set_qbo_customer_mapping","set_qbo_item_mapping","set_qbo_deposit_mapping","set_qbo_push_defaults","start_qbo_push","write_off_invoice"]);
  for (const [name, args] of Object.entries(cases)) {
    const definition = catalog.filter(c => c.name === name);
    expect(definition, `${name} has one classified signature`).toHaveLength(1);
    expect(args.length, `${name} arity`).toBe(definition[0].args.length);
    const result = await db.rpc(name, Object.fromEntries(definition[0].args.map((key,i) => [key,args[i]])));
    if (qboGenericPermission.has(name)) {
      expect(result.error?.message, definition[0].signature).toMatch(/permission denied/i);
    } else {
      expect(result.error?.code, `${definition[0].signature}: ${result.error?.message}`).toBe("42501");
    }
  }
  expect(sql(`select md5(string_agg(row_to_json(t)::text,'' order by request_id)) from private.command_requests t where brewery_id='${B}';
    select md5(string_agg(row_to_json(t)::text,'' order by request_id)) from private.invite_requests t where brewery_id='${B}'`)).toEqual(before);
  expect(publicSnapshot()).toEqual(publicBefore);
  const callback = (await admin.from("chat_callback_receipts").select("id").eq("brewery_id", B).single()).data!.id;
  const action = (await admin.from("chat_action_intents").select("id").eq("brewery_id", B).single()).data!.id;
  const pos = (await admin.from("pos_connections").select("id").eq("brewery_id", B).single()).data!.id;
  const destination = (await admin.from("notification_destinations").select("id").eq("brewery_id", B).eq("user_id", f.taproom.id).single()).data!.id;
  const serviceCases: Record<string, unknown[]> = {
    store_integration_tokens: [B,"square",pos,f.owner.id,"fixture-access","fixture-refresh"], read_integration_tokens: [B,"square",pos,f.owner.id],
    read_portal_quote_tax: [B,f.customer.customerId,R(),f.taproom.id], finish_portal_quote_tax: [B,f.customer.customerId,R(),f.taproom.id,R(),0],
    begin_qbo_disconnect: [B,R(),f.taproom.id,R()], cas_integration_tokens: [B,"qbo",R(),f.taproom.id,1,"fixture-access","fixture-refresh",now,3600,3600,3600],
    read_portal_qbo_payment: [B,f.customer.customerId,f.invoice.id,f.taproom.id],
    cas_portal_qbo_payment_tokens: [B,f.customer.customerId,f.invoice.id,f.taproom.id,R(),"fixture-realm","fixture-id",["com.intuit.quickbooks.accounting"],1,"fixture-access","fixture-refresh",now,3600,3600,3600],
    confirm_portal_qbo_payment: [B,f.customer.customerId,f.invoice.id,f.taproom.id,R(),"fixture-realm","fixture-id",1,["com.intuit.quickbooks.accounting"]],
    claim_qbo_oauth: ["fixture-state",f.taproom.id,B,"https://example.test/qbo/callback"], complete_qbo_invoice_sync: [B,f.taproom.id,R(),R(),"fixture-realm",[]],
    complete_qbo_oauth: [R(),f.taproom.id,"fixture-realm","Fixture","fixture-access","fixture-refresh",now,3600,3600,3600,[]], fail_qbo_oauth: [R(),f.taproom.id],
    finish_qbo_disconnect: [B,R(),f.taproom.id,R(),true], finish_qbo_push: [B,R(),f.taproom.id,"pushed","fixture-id",null,{},R()],
    assert_chat_admin: [B], issue_chat_link_proof: [I,"U-PENDING","fixture-proof"], resolve_chat_actor: ["slack",B,f.taproom.id],
    scan_chat_today_candidates: [B,now], chat_quiet_release: [now,"22:00","07:00","America/New_York"], chat_upsert_occurrences: [B,now,f.order.id],
    chat_fanout_deliveries: [B,now,f.occurrence.id], scan_chat_notification_occurrences: [B,now], lease_chat_deliveries: [1,60,now], chat_take_lease: [delivery,now],
    complete_chat_delivery: [delivery,now,"fixture-conversation","fixture-message"], retry_chat_delivery: [delivery,now,now,"network"], suppress_chat_delivery: [delivery,now,"suppressed","fixture"],
    record_chat_callback_receipt: ["slack",B,R(),"action",f.taproom.id,"fixture-hash"], chat_assert_job: [], list_chat_scan_targets: [],
    claim_chat_callback_receipts: [1,now], complete_chat_callback_receipt: [callback,"ignored",null], get_chat_home_items: [I,f.taproom.id], get_chat_delivery_context: [delivery,now],
    block_notification_destination: [destination,"fixture"], issue_chat_action_intent: [I,f.taproom.id,"mgr_refresh",null], consume_chat_action_intent: [callback,action,"mgr_refresh",{}],
    activate_chat_installation: [I,"fixture-state","https://example.test/chat/callback",B,null,"Fixture",`fixture-${B}`,{ scopes: ["chat:write","im:write","groups:read"] },f.owner.id],
    find_chat_oauth_intent: ["fixture-state",f.owner.id], mark_chat_installation_reauthorization: [I,"token_expired"], reconcile_chat_installation: [I,true,null],
    set_notification_destination: [B,I,"shared",R(),f.owner.id,now], get_chat_settings_installation: [B,I,f.owner.id],
    chat_credential_has_canonical_owner: [B], has_active_canonical_chat_installation: [B], get_chat_installation_lifecycle: [I], prune_chat_integration_logs: ["90 days"],
    chat_settings_request_completed: [B,f.taproom.id,importRequest],
  };
  const serviceCatalog = sql(`select json_build_object('name',p.proname,'signature',p.oid::regprocedure::text,'args',p.proargnames[1:p.pronargs]) from pg_proc p
    where p.pronamespace='public'::regnamespace and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
      and has_function_privilege('service_role',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute')
      and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')`).map(row => JSON.parse(row) as {name:string;signature:string;args:string[]|null});
  expect(serviceCatalog.map(c => c.name).sort()).toEqual(Object.keys(serviceCases).sort());
  for (const c of serviceCatalog) {
    const args = serviceCases[c.name]; expect(args.length, c.signature).toBe((c.args ?? []).length);
    const result = await db.rpc(c.name, Object.fromEntries((c.args ?? []).map((key,i) => [key,args[i]])));
    expect(result.error?.code, `${c.signature}: ${result.error?.message}`).toBe("42501");
  }
  expect(publicSnapshot()).toEqual(publicBefore);
  expect(sql(`select md5(string_agg(row_to_json(t)::text,'' order by request_id)) from private.command_requests t where brewery_id='${B}';
    select md5(string_agg(row_to_json(t)::text,'' order by request_id)) from private.invite_requests t where brewery_id='${B}'`)).toEqual(before);
  const ownCommands = ownNames.map(name => name === "set_personal_notification_destination" ? "set_notification_destination" : name);
  const ctx = { db, userId: f.taproom.id, breweryId: B, role: "taproom" as const };
  const commands = listTools().filter(t => t.kind === "command" && t.scope === "tenant");
  expect(commands.filter(t => { const roles = getCommandDefinition(t.name)!.roles; return roles === "any" || Array.isArray(roles) && roles.includes("taproom"); }).map(t => t.name).sort()).toEqual([...ownCommands,"record_taproom_count","tap_keg","kick_keg","swap_keg"].sort());
  for (const command of commands.filter(t => !ownCommands.includes(t.name) && !["record_taproom_count","tap_keg","kick_keg","swap_keg"].includes(t.name))) {
    const definition = getCommandDefinition(command.name)!;
    const input = sampleInput(definition.input);
    expect(definition.input.safeParse(input).success, `${command.name} valid registry input`).toBe(true);
    await expect(runCommand(command.name, input, ctx), command.name).rejects.toMatchObject({ status: 403, code: "permission_denied" });
  }
}, 120_000);
