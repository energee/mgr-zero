import type { Database } from "@/lib/supabase/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { rawDatabase } from "./raw-database";
import { admin, asUser, ins, makeBrewery, makeStaff, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";

// Adding an RLS table requires an explicit decision AND a nonempty fixture below.
// This is the approved read matrix, deliberately independent of taproom_can.
export const matrix = {
  breweries: "deny", brewery_users: "self", brewery_counters: "deny", customer_users: "deny",
  customers: "deny", ship_tos: "deny", vendors: "deny", materials: "deny", material_lots: "deny",
  styles: "deny", water_profiles: "deny", price_groups: "deny", brands: "tenant", catalog_categories: "deny", formats: "tenant", format_components: "tenant",
  keg_pools: "tenant", skus: "tenant", format_bom: "deny", locations: "taproom", bins: "taproom",
  sale_channels: "deny", channel_prices: "deny", price_group_barcodes: "deny", inventory_movements: "deny", allocations: "deny",
  taproom_pars: "taproom", tap_intervals: "tenant", taproom_counts: "tenant", taproom_count_lines: "tenant", recipes: "deny", recipe_versions: "deny", recipe_ingredients: "deny", recipe_water_additions: "deny",
  vessels: "deny", batches: "deny", vessel_occupancies: "deny", transfers: "deny", volume_adjustments: "deny", volume_adjustment_reclassifications: "deny",
  fermentation_readings: "deny", material_movements: "deny", batch_additions: "deny", brew_records: "deny", brew_pulls: "deny", packaging_runs: "deny",
  lots: "deny", packaging_run_outputs: "deny", packaging_run_consumptions: "deny", packaging_material_records: "deny", packaging_material_actuals: "deny", material_contracts: "deny",
  purchase_orders: "deny", purchase_order_lines: "deny", receipts: "deny", receipt_lines: "deny",
  material_counts: "deny", material_count_lines: "deny", orders: "deny", order_lines: "deny", order_deposit_lines: "deny", order_events: "deny",
  shipments: "deny", invoices: "deny", invoice_questions: "deny", invoice_lines: "deny", invoice_payments: "deny", invoice_payment_voids: "deny", keg_events: "deny",
  stock_transfers: "deny", stock_transfer_lines: "deny", qbo_connections: "deny", qbo_pushes: "deny", qbo_customer_snapshots: "deny", qbo_customer_decisions: "deny", pos_connections: "deny",
  pos_locations: "tenant", pos_item_mappings: "tenant", pos_catalog_variations: "deny", pos_catalog_items: "deny", pos_catalog_ownership: "deny", pos_menus: "deny", pos_menu_lines: "deny", pos_sales: "deny", pos_sale_expectations: "deny", pos_sales_coverage: "deny", brand_approvals: "cola", cola_label_images: "deny",
  pos_location_mapping_history: "deny",
  state_registrations: "deny", brewery_state_licenses: "deny", report_filings: "deny", routes: "deny",
  reporting_basis_corrections: "deny", report_basis_amendments: "deny",
  deliveries: "deny", chat_installations: "deny", chat_user_links: "self", notification_destinations: "self",
  notification_preferences: "self", notification_occurrences: "deny", notification_deliveries: "deny",
  chat_callback_receipts: "deny", chat_action_intents: "deny",
} as const;
export type Table = keyof typeof matrix;
export type Row = Record<string, unknown>;
const compositeKeys: Partial<Record<Table, string[]>> = {
  brewery_users: ["brewery_id", "user_id"], brewery_counters: ["brewery_id", "key"],
  customer_users: ["customer_id", "user_id"], format_components: ["parent_format_id", "child_format_id"],
  format_bom: ["format_id", "material_id"], channel_prices: ["sale_channel_id", "price_group_id", "format_id"], price_group_barcodes: ["price_group_id", "format_id"],
  taproom_pars: ["location_id", "sku_id"], pos_locations: ["connection_id", "external_location_id"],
  pos_item_mappings: ["connection_id", "external_item_id", "external_variation_id"],
  pos_catalog_variations: ["connection_id", "external_item_id", "external_variation_id"], pos_sale_expectations: ["sale_id"],
  pos_catalog_items: ["connection_id", "brand_id", "catalog_group"],
  pos_catalog_ownership: ["connection_id", "format_id", "brand_id"],
  catalog_categories: ["brewery_id", "name"],
  qbo_customer_snapshots: ["realm_id", "qbo_customer_id"],
  report_basis_amendments: ["filing_id", "correction_id"],
  cola_label_images: ["ttb_id", "image_url"],
};
export const keys = (table: Table, rows: Row[]) => rows.map(row => JSON.stringify((compositeKeys[table] ?? ["id"]).map(k => row[k]))).sort();
// These tables intentionally have no authenticated SELECT privilege, in addition to RLS.
const serviceOnly = new Set<Table>(["brewery_counters", "volume_adjustment_reclassifications", "notification_occurrences", "notification_deliveries", "chat_callback_receipts", "chat_action_intents", "cola_label_images"]);
// These tables grant service_role no SELECT either (writes arrive only through future definer RPCs), so the
// service positive control reads them with privileged SQL instead of widening the grant for the harness.
const privilegedRead: Partial<Record<Table, true>> = {
  qbo_customer_snapshots: true, qbo_customer_decisions: true,
  reporting_basis_corrections: true, report_basis_amendments: true,
  invoice_payments: true, invoice_payment_voids: true,
  cola_label_images: true,
  pos_location_mapping_history: true,
};
export const day = "2026-09-08";
export const now = "2026-09-08T12:00:00Z";

export async function fixtures() {
  const brewery = await makeBrewery();
  const owner = await makeStaff(brewery.id, "admin");
  const taproom = await makeStaff(brewery.id, "taproom");
  const put = (table: Table, row: Row) => ins(table, { brewery_id: brewery.id, ...row });
  const cat = await seedCatalog(brewery.id);
  const wh = await seedLocation(brewery.id, { name: "Warehouse" });
  const taps = await Promise.all(["Tap A", "Tap B"].map(name => seedLocation(brewery.id, { name, uses: ["taproom"] })));
  const storage = await seedLocation(brewery.id, { name: "Storage", uses: ["storage"] });
  const customer = await seedCustomer(brewery.id);
  await ins("customer_users", { customer_id: customer.customerId, user_id: owner.id });
  const vendor = await put("vendors", { name: "Vendor" });
  const material = await put("materials", { name: "Malt", category: "malt", base_uom: "lb", purchase_uom: "lb" });
  await put("material_lots", { material_id: material.id, lot_code: "M1" });
  await put("styles", { name: "IPA" });
  await put("water_profiles", { name: "Burton", calcium_ppm: 275, magnesium_ppm: 40, sodium_ppm: 25, sulfate_ppm: 610, chloride_ppm: 35, bicarbonate_ppm: 270 });
  const group = await put("price_groups", { name: "Standard", position: 1 });
  await admin.from("brands").update({ price_group_id: group.id }).eq("id", cat.brandId);
  await put("catalog_categories", { name: "Lager" });
  const composed = await put("formats", { name: "Six cases", basis: "packaged", package_type: "can" });
  await put("format_components", { parent_format_id: composed.id, child_format_id: cat.formatId, qty: 6 });
  await put("format_bom", { format_id: cat.formatId, material_id: material.id, qty_per_unit: 1 });
  const pool = await put("keg_pools", { name: "Fleet", kind: "owned" });
  await put("channel_prices", { sale_channel_id: customer.saleChannelId, price_group_id: group.id, format_id: cat.formatId, unit_price_cents: 1200 });
  await put("price_group_barcodes", { price_group_id: group.id, format_id: cat.formatId, upc: "850051366040" });
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
  await put("recipe_water_additions", { recipe_version_id: version.id, material_id: material.id, qty: 1, unit: "g", stage: "mash" });
  const vessel = await put("vessels", { name: "FV1", kind: "fermenter", capacity_bbl: 10 });
  const vessel2 = await put("vessels", { name: "FV2", kind: "fermenter", capacity_bbl: 10 });
  const batch = await put("batches", { planned_on: day, planned_bbl: 10, intended_brand_id: cat.brandId, created_by: owner.id });
  const occupancy = await put("vessel_occupancies", { vessel_id: vessel.id, batch_id: batch.id, initial_bbl: 10 });
  await put("brew_records", { batch_id: batch.id, occupancy_id: occupancy.id, brewed_on: day, initial_bbl: 10, plan_snapshot: {}, process: {}, created_by: owner.id });
  const occupancy2 = await put("vessel_occupancies", { vessel_id: vessel2.id, batch_id: batch.id });
  await put("transfers", { from_occupancy_id: occupancy.id, to_occupancy_id: occupancy2.id, bbl: 1, created_by: owner.id });
  await put("volume_adjustments", { occupancy_id: occupancy.id, bbl: -1, reason: "loss", created_by: owner.id });
  await put("fermentation_readings", { batch_id: batch.id, occupancy_id: occupancy.id, gravity_plato: 5, created_by: owner.id });
  const consumption = await put("material_movements", { material_id: material.id, location_id: wh.id, bin_id: wh.binId, qty: -1, type: "consumption", created_by: owner.id });
  await put("batch_additions", { batch_id: batch.id, stage: "mash", movement_id: consumption.id });
  await put("brew_pulls", { batch_id: batch.id, material_id: material.id, location_id: wh.id, bin_id: wh.binId, qty: 1, updated_by: owner.id });
  const run = await put("packaging_runs", { brand_id: cat.brandId, planned_on: day, created_by: owner.id });
  await put("lots", { packaging_run_id: run.id, brand_id: cat.brandId, code: "PRIVATE-LOT", packaged_on: day });
  await put("packaging_run_outputs", { run_id: run.id, sku_id: cat.skuId, qty_planned: 1 });
  await put("packaging_run_consumptions", { run_id: run.id, movement_id: consumption.id });
  const packagingRecord = await put("packaging_material_records", { run_id: run.id, planned: [], created_by: owner.id });
  await put("packaging_material_actuals", { record_id: packagingRecord.id, material_id: material.id, location_id: wh.id, bin_id: wh.binId, material_name: "Fixture material", unit: "lb", location_name: "Warehouse", bin_name: "Default", qty_used: 1, qty_loss: 0, qty_unused: 0, used_movement_id: consumption.id });
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
  // Authenticated has no insert grant on the payment ledger, so its rows go in with privileged SQL.
  sql(`with payment as (insert into public.invoice_payments(brewery_id,invoice_id,amount_cents,received_on,method,recorded_by)
      values ('${brewery.id}','${invoice.id}',500,'${day}','check','${owner.id}') returning id)
    insert into public.invoice_payment_voids(brewery_id,payment_id,reason,voided_by)
    select '${brewery.id}',id,'Authorization fixture','${owner.id}' from payment`, true);
  const transfer = await put("stock_transfers", { from_location_id: wh.id, to_location_id: taps[0].id, created_by: owner.id });
  await put("stock_transfer_lines", { transfer_id: transfer.id, sku_id: cat.skuId, qty: 1, from_bin_id: wh.binId, to_bin_id: taps[0].binId });
  const qboConnection = await put("qbo_connections", { realm_id: `realm-${brewery.id}` });
  await put("qbo_pushes", { invoice_id: invoice.id, connection_id: qboConnection.id, realm_id: `realm-${brewery.id}`,
    entity_type: "Invoice", provider_request_id: crypto.randomUUID(), request_body: "{}", local_snapshot: {}, attempt_reason: "initial" });
  const realm = `realm-${brewery.id}`;
  await put("qbo_customer_snapshots", { realm_id: realm, qbo_customer_id: "Q1", display_name: "Fixture QB customer", active: true, sync_token: "0", qbo_updated_at: now, read_at: now });
  await put("qbo_customer_decisions", { realm_id: realm, qbo_customer_id: "Q1", customer_id: customer.customerId, decision: "not_a_match", decided_by: owner.id });
  const pos = await put("pos_connections", { merchant_id: `merchant-${brewery.id}` });
  await put("pos_locations", { connection_id: pos.id, external_location_id: "L1", location_id: taps[0].id, mapping_started_at: "2026-09-01T00:00:00Z" });
  sql(`insert into public.pos_location_mapping_history(brewery_id,connection_id,external_location_id,location_id,starts_at,ends_at,retired_by)
    values('${brewery.id}','${pos.id}','L1','${wh.id}','2026-08-01T00:00:00Z','2026-09-01T00:00:00Z','${owner.id}')`, true);
  const poured = await put("formats", { brand_id: cat.brandId, name: "Pint", basis: "poured", ounces: 16 });
  const menu = await put("pos_menus", { connection_id: pos.id, external_location_id: "L1", location_id: taps[0].id, bin_id: taps[0].binId, sale_channel_id: customer.saleChannelId });
  await put("pos_menu_lines", { menu_id: menu.id, format_id: poured.id, brand_id: cat.brandId, price_override_cents: 700 });
  await put("pos_catalog_variations", { connection_id: pos.id, external_item_id: "I1", external_variation_id: "V1", external_item_name: "IPA", external_variation_name: "Can", source_version: 1 });
  await put("pos_catalog_items", { connection_id: pos.id, brand_id: cat.brandId, catalog_group: "poured", external_item_id: "I1", ownership: "adopted" });
  await put("pos_catalog_ownership", { connection_id: pos.id, brand_id: cat.brandId, catalog_group: "poured", format_id: poured.id, external_item_id: "I1", external_variation_id: "V1" });
  await put("pos_item_mappings", { connection_id: pos.id, external_item_id: "I1", external_variation_id: "V1", sku_id: cat.skuId });
  const sale = await put("pos_sales", { connection_id: pos.id, external_order_id: "O1", external_line_id: "S1", external_item_id: "I1", external_variation_id: "V1", external_location_id: "L1", sold_at: now, qty: 1 });
  sql(`select private.reconcile_pos_sale('${brewery.id}','${sale.id}')`);
  sql(`insert into public.pos_sales_coverage(brewery_id,connection_id,external_location_id,location_id,starts_at,ends_at,complete)
    values('${brewery.id}','${pos.id}','L1','${taps[0].id}','2026-09-01T00:00:00Z','${now}',true)`, true);
  await put("brand_approvals", { brand_id: cat.brandId, kind: "cola", ttb_id: "26001001000999" });
  await put("brand_approvals", { brand_id: cat.brandId, kind: "formula", ttb_id: "PRIVATE-FORMULA" });
  // Written only by store_cola_label_image, which no role here can reach for this unsaved label.
  sql(`insert into public.cola_label_images(brewery_id,ttb_id,image_url,content_type,bytes)
    values ('${brewery.id}','26001001000999','https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=Private.jpg&filetype=l','image/jpeg','\\xffd8ffd9')`);
  await put("state_registrations", { brand_id: cat.brandId, state: "PA" });
  await put("brewery_state_licenses", { state: "PA", kind: "brewery" });
  const filing = await put("report_filings", { jurisdiction: "TTB", period_start: day, period_end: day, figures: { private: true } });
  const basisCorrection = crypto.randomUUID();
  sql(`insert into public.reporting_basis_corrections(id,brewery_id,old_basis,new_basis,corrected_by,reason)
    values ('${basisCorrection}','${brewery.id}',null,'${day}','${owner.id}','Authorization fixture');
    insert into public.report_basis_amendments(brewery_id,filing_id,correction_id,old_figures,new_figures)
    values ('${brewery.id}','${filing.id}','${basisCorrection}','{}','{}')`, true);
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
  const ownerCtx = { breweryId: brewery.id, userId: owner.id, roles: ["admin" as const], db: await asUser(owner.email) };
  const completed = await runCommand("complete_batch", { batchId: batch.id, confirmInTankBbl: Number((await runCommand("get_batch_completion_preview", { batchId: batch.id }, ownerCtx) as { inTankBbl: string }).inTankBbl) }, ownerCtx) as { adjustmentId: string };
  await runCommand("reattribute_loss", { adjustmentId: completed.adjustmentId, bbl: 0.01, classification: "destruction" }, ownerCtx);
  return { brewery, owner, taproom, taps, wh, storage, pool, customer, cat, vendor, material, recipe, version, batch, vessel, occupancy, run, po, poLine, order, line, invoice, transfer, installation, occurrence, composed, poured };
}

interface FixtureLocation { id: string; binId: string; name: string; uses: string[] }
interface FixtureUser { id: string; email: string }
interface FixtureRow { id: string }
export interface Fixture {
  brewery: Database["public"]["Tables"]["breweries"]["Row"];
  owner: FixtureUser;
  taproom: FixtureUser;
  taps: FixtureLocation[];
  wh: FixtureLocation;
  storage: FixtureLocation;
  customer: { customerId: string; shipToId: string; saleChannelId: string };
  cat: { brandId: string; skuId: string; formatId: string };
  pool: FixtureRow; vendor: FixtureRow; material: FixtureRow; recipe: FixtureRow;
  version: FixtureRow; batch: FixtureRow; vessel: FixtureRow; occupancy: FixtureRow;
  run: FixtureRow; po: FixtureRow; poLine: FixtureRow; order: FixtureRow;
  line: FixtureRow; invoice: FixtureRow; transfer: FixtureRow; installation: FixtureRow;
  occurrence: FixtureRow; composed: FixtureRow; poured: FixtureRow;
}
export async function tenantRows(db: SupabaseClient<Database>, table: Table, f: Fixture) {
  // The installation table grants health columns only; querying secrets would test ACL, not row scope.
  let query = rawDatabase(db).from(table).select(table === "chat_installations" ? "id,brewery_id,state" : "*");
  if (table === "breweries") query = query.eq("id", f.brewery.id);
  else if (table === "customer_users") query = query.eq("customer_id", f.customer.customerId);
  else query = query.eq("brewery_id", f.brewery.id);
  if (db === admin && privilegedRead[table]) {
    return sql(`select to_jsonb(t)::text from public.${table} t where brewery_id='${f.brewery.id}'`, true).map(r => JSON.parse(r) as Row);
  }
  const result = await query;
  if (db !== admin && serviceOnly.has(table)) {
    expect(result.error?.code, `${table} service-only ACL`).toBe("42501");
    expect(result.data).toBeNull();
    return [];
  }
  expect(result.error, `${table} query`).toBeNull();
  return result.data as unknown as Row[];
}

