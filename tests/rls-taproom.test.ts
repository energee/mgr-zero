import type { Database } from "@/lib/supabase/database";
import { rawDatabase } from "./raw-database";
import { assert } from "vitest";
// Live, independently specified authorization matrix. Run only on tests/supabase.
import { sampleInput } from "@/lib/mgr/api-schema";
import { existsSync, readFileSync } from "node:fs";
import { runCommand, listTools, getCommandDefinition } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { admin, asUser, ins, makeStaff, sql } from "./helpers";
import { day, now, fixtures, matrix, keys, tenantRows, type Fixture, type Table, type Row } from "./rls-fixtures";
import { checkSchema, localEnvironment, localExpectation } from "../scripts/test-db-schema.mjs";


describe("taproom complete public RLS read boundary", () => {
  let own: Fixture, foreign: Fixture, db: SupabaseClient<Database>;
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
        (scope === "cola" && row.kind === "cola") ||
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
        assert(result.data !== null);
        expect(result.data.every((row: Row) => row.brewery_id === own.brewery.id)).toBe(true);
        expect(result.data.filter((row: Row) => row.keg_size === "half_bbl").map((row: Row) => row.location_id).sort())
          .toEqual([own.wh.id, own.storage.id, ...own.taps.map(t => t.id)].sort());
        expect(result.data.filter((row: Row) => row.keg_size === "half_bbl").map((row: Row) => row.qty)).toEqual([3, 3, 3, 3]);
      }
    }
  });

  it("taproom+brewer reads every location without duplicate on-hand balances", async () => {
    const staff = await makeStaff(own.brewery.id, ["taproom", "brewer"]);
    const client = await asUser(staff.email);
    const locations = [own.wh, own.storage, ...own.taps];
    const sort = (rows: Row[]) => [...rows].sort((a, b) =>
      `${a.location_id}:${a.keg_size ?? ""}`.localeCompare(`${b.location_id}:${b.keg_size ?? ""}`));
    const expected = locations.map(location => ({
      brewery_id: own.brewery.id, sku_id: own.cat.skuId, location_id: location.id, qty: 7,
    }));
    const onHand = await client.from("on_hand").select("*");
    expect(onHand.error).toBeNull();
    assert(onHand.data !== null);
    expect(sort(onHand.data)).toEqual(sort(expected));
    const taproomOnly = await client.rpc("taproom_on_hand_rows");
    expect(taproomOnly.error).toBeNull();
    expect(taproomOnly.data).toEqual([]);
    const kegs = locations.map(location => ({
      brewery_id: own.brewery.id, pool_id: own.pool.id, keg_size: "half_bbl",
      location_id: location.id, bin_id: location.binId, qty: 3,
    }));
    kegs.push(...[{ keg_size: "quarter_bbl", qty: -2 }, { keg_size: "sixth_bbl", qty: 0 }].map(row => ({
      brewery_id: own.brewery.id, pool_id: own.pool.id, location_id: own.taps[0].id,
      bin_id: own.taps[0].binId, ...row,
    })));
    for (const result of [await client.from("keg_bin_on_hand").select("*"), await client.rpc("keg_bin_on_hand_rows")]) {
      expect(result.error).toBeNull();
      assert(result.data !== null);
      expect(sort(result.data)).toEqual(sort(kegs));
    }
  });

  // #770: each business-record table is readable by exactly the staff roles of
  // the command that lists it, so RLS and the command gate cannot drift apart.
  // Tables not named here keep is_staff_of (the Beer landing counts through them).
  it("business-record reads follow the command role gates", async () => {
    const readBy: Partial<Record<Table, string>> = {
      customers: "list_customers", ship_tos: "get_customer", sale_channels: "list_sale_channels",
      orders: "list_orders", order_lines: "get_order", order_events: "get_order", order_deposit_lines: "get_order", shipments: "get_order",
      invoices: "list_invoices", invoice_lines: "get_invoice", invoice_questions: "list_invoice_questions",
      invoice_payments: "get_invoice", invoice_payment_voids: "get_invoice",
      deliveries: "get_delivery_stop", routes: "list_routes", stock_transfers: "list_stock_transfers", stock_transfer_lines: "get_stock_transfer",
      lots: "list_movements", channel_prices: "list_channel_prices", price_group_barcodes: "list_price_group_barcodes",
      report_filings: "list_compliance_reports", brand_approvals: "list_brands",
      reporting_basis_corrections: "list_reporting_basis_corrections", report_basis_amendments: "list_compliance_reports",
      state_registrations: "get_compliance_registry", brewery_state_licenses: "get_compliance_registry",
      pos_sales: "list_pos_sales", pos_sale_expectations: "list_pos_sales", pos_sales_coverage: "list_pos_sales",
      pos_item_mappings: "list_pos_variations", pos_locations: "list_pos_locations",
      pos_location_mapping_history: "retire_pos_location_mapping",
    };
    const clients = await Promise.all((["admin", "sales", "warehouse", "brewer"] as const).map(async role =>
      [role, await asUser((role === "admin" ? own.owner : await makeStaff(own.brewery.id, role)).email)] as const));
    await Promise.all(clients.flatMap(([role, client]) => Object.entries(readBy).map(async ([table, command]) => {
      const roles = getCommandDefinition(command)?.roles;
      expect(Array.isArray(roles), `${command} has a staff role list`).toBe(true);
      const seen = (await tenantRows(client, table as Table, own)).length;
      if ((roles as readonly string[]).includes(role)) expect(seen, `${role} reads ${table}`).toBeGreaterThan(0);
      else expect(seen, `${role} must not read ${table}`).toBe(0);
    })));
  });

  it("team list is empty for taproom", async () => {
    const team = await db.rpc("list_team_members", { p_brewery: own.brewery.id });
    expect(team.error).toBeNull();
    expect(team.data).toEqual([]);
  });

  it("projects only safe brewery columns through both view and direct function", async () => {
    const expected = [{ id: own.brewery.id, name: own.brewery.name, timezone: "America/New_York", gravity_unit: "plato", ai_model: null }];
    const view = await db.from("staff_brewery").select("*");
    const direct = await db.rpc("staff_brewery_rows");
    expect(view.error).toBeNull(); expect(direct.error).toBeNull();
    expect(view.data).toEqual(expected); expect(direct.data).toEqual(expected);
  });

  it("on-hand view and helper expose only taproom-location quantities", async () => {
    const expected = own.taps.map(t => ({ brewery_id: own.brewery.id, sku_id: own.cat.skuId, location_id: t.id, qty: 7 }));
    const sort = (rows: Row[]) => rows.sort((a, b) => String(a.location_id).localeCompare(String(b.location_id)));
    for (const result of [await db.from("on_hand").select("*"), await db.rpc("taproom_on_hand_rows")]) {
      expect(result.error).toBeNull();
      assert(result.data !== null);
      expect(sort(result.data)).toEqual(sort(expected));
    }
  });

  it("keg view and direct helper expose exactly six columns and allowed positive/negative/zero groups", async () => {
    const expected = own.taps.map(t => ({ brewery_id: own.brewery.id, pool_id: own.pool.id, keg_size: "half_bbl", location_id: t.id, bin_id: t.binId, qty: 3 }));
    expected.push(...[{ keg_size: "quarter_bbl", qty: -2 }, { keg_size: "sixth_bbl", qty: 0 }].map(r => ({ brewery_id: own.brewery.id, pool_id: own.pool.id, location_id: own.taps[0].id, bin_id: own.taps[0].binId, ...r })));
    const sort = (rows: Row[]) => rows.sort((a, b) => `${a.bin_id}:${a.keg_size}`.localeCompare(`${b.bin_id}:${b.keg_size}`));
    for (const result of [await db.from("keg_bin_on_hand").select("*"), await db.rpc("keg_bin_on_hand_rows")]) {
      expect(result.error).toBeNull();
      assert(result.data !== null);
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
  const receipt = await ins("receipts", { brewery_id: B, po_id: sentPo.id, received_by: f.owner.id });
  const submitted = await ins("stock_transfers", { brewery_id: B, from_location_id: W, to_location_id: f.taps[0].id, created_by: f.owner.id, status: "submitted" });
  const transferLine = await ins("stock_transfer_lines", { brewery_id: B, transfer_id: submitted.id, sku_id: SKU, qty: 1, from_bin_id: BIN, to_bin_id: f.taps[0].binId });
  const parentSku = await ins("skus", { brewery_id: B, brand_id: BRAND, format_id: f.composed.id, name });
  await ins("inventory_movements", { brewery_id: B, sku_id: parentSku.id, location_id: W, bin_id: BIN, qty: 1, type: "opening_balance", created_by: f.owner.id });
  const license = await ins("brewery_state_licenses", { brewery_id: B, state: "PA", kind: name });
  const contract = (await admin.from("material_contracts").select("id").eq("brewery_id", B).single()).data!.id;
  const delivery = (await admin.from("notification_deliveries").select("id").eq("brewery_id", B).single()).data!.id;
  const importRequest = R(), inviteRequest = R(), failureRequest = R(), consentInvite = R();
  const importRows = [{ skuId: SKU, locationId: W, binId: BIN, qty: "1" }];
  const authUser = await admin.auth.admin.createUser({ email: `${R()}@test.local`, email_confirm: true });
  expect(authUser.error).toBeNull();
  sql(`insert into private.command_requests(actor_id,brewery_id,request_id,command_name,payload_hash,result)
    values('${f.taproom.id}','${B}','${importRequest}','import_csv',decode('00','hex'),'${JSON.stringify({ kind: "opening_balances", rows: importRows })}');
    insert into private.invite_requests(brewery_id,actor_id,email,kind,role,auth_user_id,state,request_id)
    values('${B}','${f.taproom.id}','${inviteRequest}@test.local','staff','warehouse','${authUser.data.user!.id}','pending_membership','${inviteRequest}'),
      ('${B}','${f.taproom.id}','${failureRequest}@test.local','staff','warehouse','${authUser.data.user!.id}','pending_membership','${failureRequest}');
    insert into private.invite_requests(id,brewery_id,actor_id,email,kind,role,auth_user_id,state,request_id,consent_expires_at)
    values('${consentInvite}','${B}','${f.taproom.id}','${authUser.data.user!.email}','staff','warehouse','${authUser.data.user!.id}','pending_consent','${R()}',now()+interval '7 days');`);
  expect(sql(`select count(*) from private.command_requests where actor_id='${f.taproom.id}' and request_id='${importRequest}' and result->'rows' <> '[]'::jsonb`)).toEqual(["1"]);
  expect(sql(`select count(*) from private.invite_requests where actor_id='${f.taproom.id}' and request_id in ('${inviteRequest}','${failureRequest}')`)).toEqual(["2"]);
  const reversible = await ins("inventory_movements", { brewery_id: B, sku_id: SKU, location_id: W, bin_id: BIN, qty: 1, type: "adjustment", created_by: f.owner.id });
  const refusedStop = (await admin.from("deliveries").select("id").eq("brewery_id", B).single()).data!.id;
  const cases: Record<string, unknown[]> = {
    check_in_refused_return: [refusedStop,W,[],R()],
    list_sale_channels: [B],
    get_batch_volume_balance: [B,plannedBatch.id],
    reverse_inventory_movement: [B,reversible.id,"Wrong entry",R()],
    preview_inventory_movement: [B,SKU,W,BIN,1,"adjustment",null,null,null,null,R()],
    set_brewery_operating_defaults: [B,24,R(),21], set_brewery_books_opened_on: [B,"2026-10-01",R()], set_one_way_keg_fee: [B,1000,R()], set_brewery_ai_model: [B,"openai/gpt-5.4",R()], begin_csv_import: [B,"opening_balances",importRows,R()], import_csv_row: [B,importRequest,0],
    correct_reporting_basis: [B,"2026-09-01",null,"Correct basis",R()],
    claim_invite_request: [B,`${name}@test.local`,"staff","warehouse",null,R()], complete_invite_membership: [inviteRequest], record_invite_failure: [failureRequest],
    revoke_account_invitation: [B,consentInvite,R()], resend_account_invitation: [B,consentInvite,R()],
    record_keg_event: [B,f.pool.id,"half_bbl",1,"acquired",W,BIN,null,null,R()], update_keg_pool: [B,f.pool.id,name,null,null,0,true,R()], create_keg_pool: [B,name,"owned",null,null,0,R()],
    begin_chat_installation: [B,"slack","https://example.test/chat/callback","state",R()], begin_chat_reauthorization: [B,I,"https://example.test/chat/callback","state",R()],
    begin_qbo_oauth: [B,"https://example.test/qbo/callback","state","connect",R(),["com.intuit.quickbooks.accounting"]], begin_qbo_invoice_sync: [B,R()], get_qbo_sync_status: [B],
    begin_square_oauth: [B,"https://example.test/square/callback","state","connect",R(),["ITEMS_READ","ITEMS_WRITE","MERCHANT_PROFILE_READ","ORDERS_READ"]],
    begin_square_catalog_sync: [B,R()],
    begin_square_menu_publication: [B,"L1",false,R()],
    begin_square_publication: [B,"L1",BRAND,null,null,false,"publish_pos_item",R(),null],
    begin_square_sales_sync: [B,R()],
    packaging_material_plan: [B,[{sku_id:SKU,qty_planned:1}]],
    get_packaging_material_plan: [B,[{sku_id:SKU,qty_planned:1}]],
    get_packaging_close_plan: [B,readyRun.id],
    get_packaging_material_record: [B,readyRun.id],
    get_packaging_run_lot: [B,readyRun.id],
    correct_packaging_material_record: [B,R(),"Correction",[],R()],
    get_packaging_output_corrections: [B,readyRun.id],
    correct_packaging_run_outputs: [B,readyRun.id,null,"Correction",0,[],W,BIN,R()],
    close_packaging_run: [B,readyRun.id,0.0645,[{sku_id:SKU,qty_actual:1}],name,day,null,W,BIN,R(),[],"reviewed"],
    complete_batch: [B,f.batch.id,R(),1],
    reattribute_loss: [B,(await admin.from("volume_adjustments").select("id").eq("brewery_id", B).eq("reason", "loss").limit(1).single()).data!.id,0.01,"destruction",null,R()],
    create_purchase_order: [B,VENDOR,day,null,[{material_id:MAT,qty_ordered:1,unit_cost_cents:100}],R()], create_recipe: [B,BRAND,name,null,R()],
    create_recipe_version: [B,f.recipe.id,[{name:"Sacc",kind:"infusion",tempF:152,minutes:60}],[],{},0.75,0.75,60,40,null,[{material_id:MAT,per_bbl_qty:1,stage:"mash"}],R()],
    create_composed_format: [B,name,"can",[{child_format_id:f.composed.id,qty:1}],R()], delete_catalog_category: [B,"Lager",R()], delete_customer: [B,f.customer.customerId,R()], delete_ship_to: [B,f.customer.shipToId,R()], delete_format: [B,f.composed.id,R()], delete_material_contract: [B,contract,R()], save_catalog_category: [B,null,name,R()],
    delete_bin: [B,emptyBin,R()], delete_brewery_state_license: [B,license.id,R()], disable_chat_installation: [B,I,R()], disconnect_chat_installation: [B,I,R()], draft_purchase_order_from_requirements: [B,[MAT],R()],
    portal_create_order: [B,f.customer.customerId,f.customer.shipToId,null,null,[{sku_id:SKU,qty:1}],R(),day],
    portal_quote_order: [B,f.customer.customerId,f.customer.shipToId,day,null,null,[{sku_id:SKU,qty:1}],R()],
    portal_submit_quote: [B,f.customer.customerId,R(),null,R()],
    cancel_purchase_order: [B,draftPo.id,"Fixture",R()], close_purchase_order_short: [B,sentPo.id,"Fixture",R()],
    receive_purchase_order: [B,sentPo.id,W,BIN,day,[{po_line_id:sentLine.id,qty_counted:1}],R()],
    correct_purchase_receipt: [B,receipt.id,"Wrong count",[{po_line_id:sentLine.id,qty_counted:1}],R(),W,BIN],
    record_brew_day: [B,plannedBatch.id,emptyVessel.id,2,day,R(),[],{},true],
    save_batch_pulls: [B,plannedBatch.id,null,[],R()],
    correct_brew_record: [B,R(),"Test correction",1,[],{},true,R()],
    get_brew_day_plan: [B,plannedBatch.id], get_brew_record: [B,plannedBatch.id], record_cellar_transfer: [B,f.occupancy.id,emptyVessel.id,1,0,R()],
    record_batch_addition: [B,f.occupancy.id,MAT,"dry_hop",null,1,null,R()],
    record_fermentation_reading: [B,null,f.occupancy.id,now,68,5,4.2,null,R()], record_historical_batch: [B,plannedBatch.id,day,day,1,{},R()], record_historical_packaging_run: [B,plannedBatch.id,day,[{sku_id:SKU,qty:1}],"L-1",R()], record_historical_order: [B,f.customer.customerId,f.customer.shipToId,day,[{sku_id:SKU,qty:1,unit_price_cents:1}],null,R()], record_material_count: [B,W,BIN,day,[{material_id:MAT,qty:1}],R(),"0".repeat(32)],
    record_repack: [B,W,BIN,parentSku.id,1,SKU,6,R(),null], record_stock_transfer_pick: [submitted.id,[{line_id:transferLine.id,qty:1}],R()], record_submitted_order_occurrence: [f.order.id],
    cancel_batch: [B,plannedBatch.id,R()], set_recipe_brand: [B,f.recipe.id,BRAND,R()], reschedule_batch: [B,plannedBatch.id,day,R()],
    cancel_packaging_run: [B,readyRun.id,R()], reschedule_packaging_run: [B,readyRun.id,day,R()],
    schedule_batch: [B,BRAND,f.version.id,day,2,null,R()], schedule_packaging_run: [B,BRAND,day,f.occupancy.id,[{sku_id:SKU,qty_planned:1}],R()], send_purchase_order: [B,draftPo.id,"external",R()], update_purchase_order: [B,draftPo.id,VENDOR,day,[{material_id:MAT,qty_ordered:1}],R()],
    set_brewery_gravity_unit: [B,"sg",R()], set_brewery_quiet_hours: [B,I,"22:00","07:00",R()], set_portal_fulfillment_source: [B,W,R()], cancel_stock_transfer: [f.transfer.id,"Fixture",R()],
    set_qbo_customer_mapping: [B,f.customer.customerId,"qbo-customer",R()], set_qbo_item_mapping: [B,SKU,"qbo-item",R()],
    set_qbo_deposit_mapping: [B,"qbo-deposit",R()], set_qbo_one_way_fee_mapping: [B,"qbo-fee",R()], set_qbo_push_defaults: [B,true,true,R()], start_qbo_push: [B,f.invoice.id,"initial",R()], write_off_invoice: [B,f.invoice.id,"Fixture",R()],
    record_invoice_payment: [B,f.invoice.id,100,day,"check",null,R()], void_invoice_payment: [B,sql(`select id from public.invoice_payments where brewery_id='${B}'`,true)[0],"Fixture",R()],
    set_qbo_vendor_mapping: [B,VENDOR,"qbo-vendor",R()], set_qbo_purchase_account: [B,"qbo-account",R()],
    start_qbo_receipt_bill: [B,receipt.id,R(),null],
    set_pos_location_mapping: [B,"L1",f.taps[0].id,R()], set_pos_item_mapping: [B,"I1","V1",SKU,null,false,R()],
    retire_pos_location_mapping: [B,"L1",R()], reorder_refused_delivery: [f.order.id,R()],
    set_personal_quiet_hours: [B,"22:00","07:00","America/New_York",R()], snooze_notification: [B,delivery,new Date(Date.now()+3600000).toISOString(),R()],
    generate_compliance_report: [B,"TTB",day,day], get_chat_integration_health: [B], list_chat_user_links: [B],
    get_square_connected: [B], list_compliance_active_months: [B,day,day],
    update_bin: [B,emptyBin,name,R()], update_location: [B,W,name,["warehouse"],R()], update_sku: [B,SKU,true,null,R(),null,false,0.5,false], raise_invoice_question: [B,f.invoice.id,"Fixture question",R()],
    update_packaging_run: [B,readyRun.id,f.occupancy.id,[{sku_id:SKU,qty_planned:1}],now,R()], upsert_material: [B,MAT,"Malt","malt","lb","lb",1,false,VENDOR,0,true,null,R()],
    upsert_material_contract: [B,contract,VENDOR,MAT,100,100,day,null,name,R()], upsert_vendor: [B,VENDOR,"Vendor",null,null,1,"net30",true,R()], upsert_vessel: [B,emptyVessel.id,name,"fermenter",10,R()], delete_vessel: [B,emptyVessel.id,R()],
    upsert_water_profile: [B,null,name,1,1,1,1,1,1,null,null,null,R()],
  };
  const catalog = sql(`select json_build_object('name',p.proname,'signature',p.oid::regprocedure::text,'args',p.proargnames[1:p.pronargs]) from pg_proc p
    where p.pronamespace='public'::regnamespace and has_function_privilege('authenticated',p.oid,'execute')
      and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')`).map(row => JSON.parse(row) as {name:string;signature:string;args:string[]});
  const readNames = ["get_beer_overview_aggregates","trace_lot_ingredients","trace_material_lot","trace_lot_sources","trace_batch_lots","get_material_count_preview","list_my_invitations","get_order_email_status","get_batch_completion_preview","get_loss_review","get_pos_menu","get_pos_menu_item","get_taproom_draft_projection","get_taproom_variance","list_open_taps","list_tap_history","get_taproom_count_snapshot","get_taproom_print_labels","get_taproom_count","list_taproom_counts","taproom_can","staff_brewery_rows","keg_bin_on_hand_rows","taproom_on_hand_rows","pos_order_versions","get_chat_integration_health","get_chat_link_intent","list_chat_user_links","generate_compliance_report","get_today_items","is_staff_of","my_brewery_ids","my_staff_brewery_ids","my_customer_ids","portal_availability","portal_brewery_rows","portal_customer_rows","portal_invoice_rows","portal_keg_deposit_rows","portal_order_event_rows","portal_order_rows","portal_shipment_rows","portal_sku_price_rows","portal_schedule_rows","staff_roles","has_staff_role","today_live_reasons","list_team_members","list_customer_users","customers_missing_portal_email","list_chat_conversations","get_chat_history"];
  readNames.push("order_packaging_shortfall_rows");
  readNames.push("get_keg_report_aging");
  // list_invoices and get_invoice read the QuickBooks push facts through it (#1045).
  readNames.push("invoice_push_facts");
  // list_compliance_active_periods reads which recent periods hold report activity (#1209).
  readNames.push("list_compliance_active_months");
  // Team's pending invitations (#1204) return no rows to a caller without Admin.
  readNames.push("list_pending_invitations");
  // Every staff role reads the brewery's Slack state and quiet hours (#1208).
  readNames.push("get_staff_chat_installation");
  // Saved COLA images expose only their brewery permit to staff, including Taproom.
  readNames.push("get_saved_cola_image_permit");
  // Every staff role reads its brewery's copies of saved COLA labels; store_cola_label_image is service-only.
  readNames.push("get_stored_cola_label_image");
  // Existing-account consent is authenticated own-identity work, covered by existing-account-invites.test.ts.
  const ownNames = ["accept_account_invitation","set_my_gravity_unit","consume_chat_link_proof","unlink_chat_user","set_notification_preference","set_personal_notification_destination","create_chat_conversation","append_chat_message"];
  const existing = [...readFileSync(new URL("./rls-command-boundary.test.ts", import.meta.url), "utf8").matchAll(/rpc: "(\w+)"/g)].map(m => m[1]);
  const infrastructureNames = ["consume_command_admission"];
  expect([...new Set(catalog.map(c => c.name))].sort()).toEqual([...new Set([...Object.keys(cases),...existing,...readNames,...ownNames,...infrastructureNames])].sort());
  const publicSnapshot = () => sql((Object.keys(matrix) as Table[]).map(table => {
    const predicate = table === "breweries" ? `id='${B}'` : table === "customer_users" ? `customer_id='${f.customer.customerId}'` : `brewery_id='${B}'`;
    return `select '${table}:' || md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'')) from public.${table} t where ${predicate}`;
  }).join(";"));
  const publicBefore = publicSnapshot();
  const readSignatures = ["get_beer_overview_aggregates(uuid)","trace_lot_ingredients(uuid,uuid)","trace_material_lot(uuid,uuid)","trace_lot_sources(uuid,uuid)","trace_batch_lots(uuid,uuid)","get_material_count_preview(uuid,uuid,uuid,jsonb)","list_my_invitations()","get_order_email_status(uuid,uuid)","get_batch_completion_preview(uuid,uuid)","get_loss_review(uuid,date,date)","get_pos_menu(uuid,text)","get_pos_menu_item(uuid,text,uuid,uuid)","get_taproom_draft_projection(uuid,uuid)","get_taproom_variance(uuid,uuid,integer)","list_open_taps(uuid,uuid)","list_tap_history(uuid,uuid)","get_taproom_count_snapshot(uuid,uuid)","get_taproom_print_labels(uuid,uuid,text)","get_taproom_count(uuid,uuid)","list_taproom_counts(uuid,uuid)","taproom_can(uuid,text)","staff_brewery_rows()","keg_bin_on_hand_rows()","taproom_on_hand_rows()","pos_order_versions()","get_chat_integration_health(uuid)","get_chat_link_intent(uuid,text)","list_chat_user_links(uuid)","generate_compliance_report(uuid,text,date,date)","get_today_items(uuid,timestamp with time zone)","is_staff_of(uuid)","my_brewery_ids()","my_staff_brewery_ids(staff_role[])","my_customer_ids()","portal_availability(uuid)","portal_brewery_rows()","portal_customer_rows()","portal_invoice_rows()","portal_keg_deposit_rows()","portal_order_event_rows()","portal_order_rows(uuid)","portal_shipment_rows()","portal_sku_price_rows()","portal_schedule_rows()","staff_roles(uuid)","has_staff_role(uuid,staff_role[])","today_live_reasons()","list_team_members(uuid)","list_customer_users(uuid,uuid)","customers_missing_portal_email(uuid)","list_chat_conversations(uuid)","get_chat_history(uuid,uuid,integer)"];
  readSignatures.push("order_packaging_shortfall_rows()");
  readSignatures.push("get_keg_report_aging(uuid)");
  readSignatures.push("invoice_push_facts(uuid,uuid[])");
  readSignatures.push("list_compliance_active_months(uuid,date,date)");
  readSignatures.push("list_pending_invitations(uuid)");
  readSignatures.push("get_staff_chat_installation(uuid)");
  readSignatures.push("get_saved_cola_image_permit(uuid,text,text)");
  readSignatures.push("get_stored_cola_label_image(uuid,text,text)");
  const ownSignatures = ["accept_account_invitation(uuid,uuid)","set_my_gravity_unit(uuid,text,uuid)","consume_chat_link_proof(uuid,text,uuid)","unlink_chat_user(uuid,uuid,uuid)","set_notification_preference(uuid,text,boolean,time without time zone,time without time zone,text,boolean,uuid)","set_personal_notification_destination(uuid,text,uuid,uuid)","create_chat_conversation(uuid,text,uuid)","append_chat_message(uuid,uuid,text,text,uuid)"];
  expect(catalog.filter(c => readNames.includes(c.name)).map(c => c.signature).sort()).toEqual(readSignatures.sort());
  expect(catalog.filter(c => ownNames.includes(c.name)).map(c => c.signature).sort()).toEqual([...ownSignatures].sort());
  // #467: brewery bootstrap is service-role only; the server passes the verified actor.
  expect(catalog.filter(c => c.name === "provision_brewery")).toEqual([]);
  expect(catalog.filter(c => infrastructureNames.includes(c.name)).map(c => c.signature)).toEqual(["consume_command_admission()"]);
  await expect(db.rpc("consume_command_admission")).resolves.toMatchObject({ data: [{ allowed: true, retry_after: 0 }], error: null });
  for (const name of new Set(existing)) expect(catalog.filter(c => c.name === name), `${name} existing lifecycle case`).toHaveLength(1);
  const sharedDestination = await db.rpc("set_notification_destination", { p_brewery: B, p_installation: I, p_external_destination_id: "shared", p_request_id: R(), p_actor: f.owner.id, p_version: now });
  expect(sharedDestination.error?.code).toBe("42501");
  const before = sql(`select md5(string_agg(row_to_json(t)::text,'' order by request_id)) from private.command_requests t where brewery_id='${B}';
    select md5(string_agg(row_to_json(t)::text,'' order by request_id)) from private.invite_requests t where brewery_id='${B}'`);
  const qboGenericPermission = new Set(["get_qbo_sync_status","begin_qbo_oauth","begin_qbo_invoice_sync","set_qbo_customer_mapping","set_qbo_item_mapping","set_qbo_deposit_mapping","set_qbo_push_defaults","start_qbo_push","write_off_invoice"]);
  for (const [name, args] of Object.entries(cases)) {
    const definition = catalog.filter(c => c.name === name);
    expect(definition, `${name} has one classified signature`).toHaveLength(1);
    expect(args.length, `${name} arity`).toBe(definition[0].args.length);
    const result = await rawDatabase(db).rpc(name, Object.fromEntries(definition[0].args.map((key,i) => [key,args[i]])));
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
    lease_order_emails: ["orders@example.test"], finish_order_email: [R(),R(),"provider-id",null],
    record_qbo_invoice_sync_failure: [B,f.taproom.id,R()],
    store_integration_tokens: [B,"square",pos,f.owner.id,"fixture-access","fixture-refresh"], read_integration_tokens: [B,"square",pos,f.owner.id],
    read_portal_quote_tax: [B,f.customer.customerId,R(),f.taproom.id], finish_portal_quote_tax: [B,f.customer.customerId,R(),f.taproom.id,R(),0],
    read_portal_quote_tax_tokens: [B,f.customer.customerId,R(),f.taproom.id],
    lease_portal_quote_tax_refresh: [B,f.customer.customerId,R(),f.taproom.id,R(),1,R()],
    cas_portal_quote_tax_tokens: [B,f.customer.customerId,R(),f.taproom.id,R(),1,"fixture-access","fixture-refresh",now,3600,3600,3600,R()],
    mark_portal_quote_tax_authorization_failed: [B,f.customer.customerId,R(),f.taproom.id,R(),1,null],
    begin_qbo_disconnect: [B,R(),f.taproom.id,R()], cas_integration_tokens: [B,"qbo",R(),f.taproom.id,1,"fixture-access","fixture-refresh",now,3600,3600,3600],
    read_portal_qbo_payment: [B,f.customer.customerId,f.invoice.id,f.taproom.id],
    mark_qbo_authorization_failed: [B,R(),f.taproom.id,1,null,null],
    lease_qbo_token_refresh: [B,R(),f.taproom.id,1,R(),null,null], release_qbo_token_refresh: [B,R(),R()],
    cas_portal_qbo_payment_tokens: [B,f.customer.customerId,f.invoice.id,f.taproom.id,R(),"fixture-realm","fixture-id",["com.intuit.quickbooks.accounting"],1,"fixture-access","fixture-refresh",now,3600,3600,3600],
    confirm_portal_qbo_payment: [B,f.customer.customerId,f.invoice.id,f.taproom.id,R(),"fixture-realm","fixture-id",1,["com.intuit.quickbooks.accounting"]],
    claim_qbo_oauth: ["fixture-state",f.taproom.id,B,"https://example.test/qbo/callback"], qbo_oauth_exchange_state: ["fixture-state",f.taproom.id,B], complete_qbo_invoice_sync: [B,f.taproom.id,R(),R(),"fixture-realm",[]],
    complete_qbo_oauth: [R(),f.taproom.id,"fixture-realm","Fixture","fixture-access","fixture-refresh",now,3600,3600,3600,[]], fail_qbo_oauth: [R(),f.taproom.id],
    hold_qbo_oauth_tokens: [R(),f.taproom.id,"fixture-realm","fixture-refresh"], reap_qbo_oauth_exchanges: [], discard_qbo_oauth_tokens: [R(),"fixture-refresh"],
    finish_qbo_disconnect: [B,R(),f.taproom.id,R(),true], finish_qbo_push: [B,R(),f.taproom.id,"pushed","fixture-id",null,{},R()],
    finish_qbo_receipt_bill: [B,receipt.id,f.taproom.id,R(),"fixture-bill",null,{},false],
    claim_square_oauth: ["fixture-state",f.taproom.id,B,"https://example.test/square/callback"], fail_square_oauth: [R(),f.taproom.id,"not_required",null],
    complete_square_oauth: [R(),f.taproom.id,"fixture-merchant","Fixture","fixture-access","fixture-refresh",now,["ITEMS_READ"],[]],
    record_square_catalog_snapshot: [B,pos,f.taproom.id,1,R(),[],[]],
    advance_square_catalog_sync: [B,pos,f.taproom.id,R(),1,2], mark_square_authorization_failed: [B,pos,f.taproom.id,1],
    advance_square_sales_sync: [B,pos,f.taproom.id,R(),1,2],
    record_square_sales_locations: [B,pos,f.taproom.id,R(),1,[]],
    record_square_sales_page: [B,pos,f.taproom.id,R(),1,[],null,null,[],[]],
    begin_square_disconnect: [B,pos,f.taproom.id,R()], finish_square_disconnect: [B,pos,f.taproom.id,R(),true],
    lease_square_publication: [B,R(),f.taproom.id],
    prepare_square_publication: [B,R(),f.taproom.id,"{}",null,null],
    finish_square_publication: [B,R(),f.taproom.id,null,{}],
    finish_square_menu_publication: [B,R(),f.taproom.id],
    assert_chat_admin: [B], issue_chat_link_proof: [I,"U-PENDING","fixture-proof","Morgan Slack"], resolve_chat_actor: ["slack",B,f.taproom.id],
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
    get_published_pos_menu: [R()], store_cola_label_image: [B,"26001001000999","https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=Forged.jpg&filetype=l","data:image/jpeg;base64,/9j/2Q=="],
    provision_brewery: [f.taproom.id,"Fixture","America/New_York",null,R()],
    close_brewery: [B], prune_command_requests: [],
  };
  if (existsSync(".env.test.local")) {
    // Admit only this reset's verified probe; every other service RPC still
    // needs an explicit case, and this one stays in the denial loop below.
    const env = localEnvironment();
    const identity = await checkSchema(env, localExpectation());
    expect(identity.rpc).toMatch(/^mgr_test_identity_[a-f0-9]{32}$/);
    expect(sql(`select json_build_object(
        'arity',p.pronargs,'returns',p.prorettype::regtype::text,'invoker',not p.prosecdef,
        'pinned',coalesce(p.proconfig @> array['search_path=""'],false),
        'public',exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'),
        'anon',has_function_privilege('anon',p.oid,'execute'),
        'authenticated',has_function_privilege('authenticated',p.oid,'execute'),
        'service',has_function_privilege('service_role',p.oid,'execute'))
      from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='${identity.rpc}'`)
      .map(row => JSON.parse(row))).toEqual([{
        arity: 0, returns: "jsonb", invoker: true, pinned: true,
        public: false, anon: false, authenticated: false, service: true,
      }]);
    const anonymous = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    expect((await rawDatabase(anonymous).rpc(identity.rpc, {})).error?.code).toBe("42501");
    const service = await rawDatabase(admin).rpc(identity.rpc, {});
    expect(service.error).toBeNull();
    expect(service.data).toEqual(identity);
    serviceCases[identity.rpc] = [];
  }
  const serviceCatalog = sql(`select json_build_object('name',p.proname,'signature',p.oid::regprocedure::text,'args',p.proargnames[1:p.pronargs]) from pg_proc p
    where p.pronamespace='public'::regnamespace and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
      and has_function_privilege('service_role',p.oid,'execute') and not has_function_privilege('authenticated',p.oid,'execute')
      and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')`).map(row => JSON.parse(row) as {name:string;signature:string;args:string[]|null});
  expect(serviceCatalog.map(c => c.name).sort()).toEqual(Object.keys(serviceCases).sort());
  for (const c of serviceCatalog) {
    const args = serviceCases[c.name]; expect(args.length, c.signature).toBe((c.args ?? []).length);
    const result = await rawDatabase(db).rpc(c.name, Object.fromEntries((c.args ?? []).map((key,i) => [key,args[i]])));
    expect(result.error?.code, `${c.signature}: ${result.error?.message}`).toBe("42501");
  }
  expect(publicSnapshot()).toEqual(publicBefore);
  expect(sql(`select md5(string_agg(row_to_json(t)::text,'' order by request_id)) from private.command_requests t where brewery_id='${B}';
    select md5(string_agg(row_to_json(t)::text,'' order by request_id)) from private.invite_requests t where brewery_id='${B}'`)).toEqual(before);
  const ownCommands = ownNames.filter(name => name !== "accept_account_invitation").map(name => name === "set_personal_notification_destination" ? "set_notification_destination" : name);
  const ctx = { db, userId: f.taproom.id, breweryId: B, roles: ["taproom" as const] };
  const commands = listTools().filter(t => t.kind === "command" && t.scope === "tenant");
  expect(commands.filter(t => { const roles = getCommandDefinition(t.name)!.roles; return roles === "any" || Array.isArray(roles) && roles.includes("taproom"); }).map(t => t.name).sort()).toEqual([...ownCommands,"record_taproom_count","tap_keg","kick_keg","swap_keg"].sort());
  for (const command of commands.filter(t => !ownCommands.includes(t.name) && !["record_taproom_count","tap_keg","kick_keg","swap_keg"].includes(t.name))) {
    const definition = getCommandDefinition(command.name)!;
    const input = sampleInput(definition.input);
    expect(definition.input.safeParse(input).success, `${command.name} valid registry input`).toBe(true);
    await expect(runCommand(command.name, input, ctx), command.name).rejects.toMatchObject({ status: 403, code: "permission_denied" });
  }
}, 120_000);
