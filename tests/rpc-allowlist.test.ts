// tests/rpc-allowlist.test.ts — every public RPC an authenticated user can
// execute, pinned by signature. A grant that is not listed here is a new
// product surface: add it in the same commit as its command, or it fails.
import { describe, expect, it } from "vitest";
import { sql } from "./helpers";

const AUTHENTICATED_RPCS = [
  "consume_command_admission()",
  "get_beer_overview_aggregates(uuid)",
  "get_keg_report_aging(uuid)",
  "get_saved_cola_image_permit(uuid,text,text)",
  "get_stored_cola_label_image(uuid,text,text)",
  "trace_lot_sources(uuid,uuid)",
  "trace_lot_ingredients(uuid,uuid)",
  "trace_material_lot(uuid,uuid)",
  "trace_batch_lots(uuid,uuid)",
  "get_taproom_draft_projection(uuid,uuid)",
  "get_taproom_variance(uuid,uuid,integer)",
  "tap_keg(uuid,uuid,uuid,text,numeric,text,numeric,uuid)",
  "kick_keg(uuid,uuid,numeric,text,uuid)",
  "swap_keg(uuid,uuid,numeric,text,uuid,text,numeric,text,numeric,uuid)",
  "list_open_taps(uuid,uuid)",
  "list_sale_channels(uuid)",
  "list_tap_history(uuid,uuid)",
  "get_taproom_count_snapshot(uuid,uuid)", "get_taproom_print_labels(uuid,uuid,text)", "get_taproom_count(uuid,uuid)", "list_taproom_counts(uuid,uuid)",
  "record_taproom_count(uuid,uuid,date,text,jsonb,uuid)", "correct_taproom_count(uuid,uuid,jsonb,text,uuid)",
  "taproom_can(uuid,text)", "staff_brewery_rows()", "keg_bin_on_hand_rows()", "taproom_on_hand_rows()",
  "order_packaging_shortfall_rows()",
  "pos_order_versions()",
  "get_chat_integration_health(uuid)",
  "get_chat_link_intent(uuid,text)",
  "get_staff_chat_installation(uuid)",
  "configure_pos_menu(uuid,text,uuid,uuid,uuid)",
  "get_pos_menu(uuid,text)",
  "get_square_connected(uuid)",
  "get_pos_menu_item(uuid,text,uuid,uuid)",
  "list_chat_user_links(uuid)",
  "set_brewery_operating_defaults(uuid,integer,uuid,integer)",
  "set_brewery_books_opened_on(uuid,date,uuid)",
  "correct_reporting_basis(uuid,date,date,text,uuid)",
  "list_compliance_active_months(uuid,date,date)",
  "set_one_way_keg_fee(uuid,integer,uuid)",
  "set_brewery_ai_model(uuid,text,uuid)",

  "begin_csv_import(uuid,text,jsonb,uuid)",
  "import_csv_row(uuid,uuid,integer)",
  "accept_account_invitation(uuid,uuid)",
  "list_my_invitations()",
  "revoke_account_invitation(uuid,uuid,uuid)",
  "list_pending_invitations(uuid)",
  "resend_account_invitation(uuid,uuid,uuid)",
  "claim_invite_request(uuid,text,text,staff_role,uuid,uuid)",
  "complete_invite_membership(uuid)",
  "record_invite_failure(uuid)",
  "record_keg_event(uuid,uuid,keg_size,integer,keg_event_reason,uuid,uuid,uuid,text,uuid)",
  "save_route(uuid,uuid,text,date,uuid,text,text,jsonb,uuid)",
  "depart_route(uuid,uuid)",
  "return_route(uuid,uuid)",
  "leave_delivery_for_later(uuid,uuid,uuid)",
  "update_keg_pool(uuid,uuid,text,uuid,integer,integer,boolean,uuid)",
  "create_keg_pool(uuid,text,keg_pool_kind,uuid,integer,integer,uuid)",
  "adjust_order_lines(uuid,jsonb,text,uuid)",
  "set_order_pickup(uuid,boolean,uuid)",
  "begin_chat_installation(uuid,text,text,text,uuid)",
  "begin_chat_reauthorization(uuid,uuid,text,text,uuid)",
  "begin_qbo_oauth(uuid,text,text,text,uuid,text[])",
  "begin_square_oauth(uuid,text,text,text,uuid,text[])",
  "begin_square_catalog_sync(uuid,uuid)",
  "begin_square_menu_publication(uuid,text,boolean,uuid)",
  "begin_square_publication(uuid,text,uuid,text,text,boolean,text,uuid,uuid)",
  "begin_square_sales_sync(uuid,uuid)",
  "begin_qbo_invoice_sync(uuid,uuid)",
  "get_qbo_sync_status(uuid)",
  "set_qbo_customer_mapping(uuid,uuid,text,uuid)",
  "set_qbo_item_mapping(uuid,uuid,text,uuid)",
  "set_qbo_deposit_mapping(uuid,text,uuid)",
  "set_qbo_one_way_fee_mapping(uuid,text,uuid)",
  "set_qbo_push_defaults(uuid,boolean,boolean,uuid)",
  "write_off_invoice(uuid,uuid,text,uuid)",
  "record_invoice_payment(uuid,uuid,integer,date,text,text,uuid)",
  "void_invoice_payment(uuid,uuid,text,uuid)",
  "invoice_push_facts(uuid,uuid[])",
  "start_qbo_push(uuid,uuid,text,uuid)",
  "set_qbo_vendor_mapping(uuid,uuid,text,uuid)",
  "set_qbo_purchase_account(uuid,text,uuid)",
  "start_qbo_receipt_bill(uuid,uuid,uuid,text)",
  "cancel_order(uuid,text,uuid)",
  "clear_channel_price(uuid,uuid,uuid,uuid,uuid)",
  "close_packaging_run(uuid,uuid,numeric,jsonb,text,date,date,uuid,uuid,uuid,jsonb,text)",
  "packaging_material_plan(uuid,jsonb)",
  "get_packaging_material_plan(uuid,jsonb)",
  "get_packaging_close_plan(uuid,uuid)",
  "get_packaging_material_record(uuid,uuid)",
  "get_packaging_run_lot(uuid,uuid)",
  "correct_packaging_material_record(uuid,uuid,text,jsonb,uuid)",
  "get_packaging_output_corrections(uuid,uuid)",
  "correct_packaging_run_outputs(uuid,uuid,uuid,text,numeric,jsonb,uuid,uuid,uuid)",
  "complete_batch(uuid,uuid,uuid,numeric)",
  "confirm_delivery(uuid,text,uuid,jsonb,text,text,boolean)",
  "check_in_refused_return(uuid,uuid,jsonb,uuid)",
  "confirm_order(uuid,uuid)",
  "get_order_email_status(uuid,uuid)",
  "confirm_restock(uuid,uuid)",
  "consume_chat_link_proof(uuid,text,uuid)",
  "create_bin(uuid,uuid,text,uuid)",
  "create_composed_format(uuid,text,package_type,jsonb,uuid)",
  "create_credit_memo(uuid,jsonb,uuid,text,uuid)",
  "create_location(uuid,text,location_kind[],uuid)",
  "create_order(uuid,order_kind,uuid,uuid,uuid,uuid,date,text,text,jsonb,uuid,boolean)",
  "create_purchase_order(uuid,uuid,date,text,jsonb,uuid)",
  "cancel_purchase_order(uuid,uuid,text,uuid)",
  "close_purchase_order_short(uuid,uuid,text,uuid)",
  "create_recipe(uuid,uuid,text,text,uuid)",
  "create_recipe_version(uuid,uuid,jsonb,jsonb,jsonb,numeric,numeric,integer,numeric,text,jsonb,uuid)",
  "create_replenishment_order(uuid,uuid,jsonb,uuid)",
  "create_sku(uuid,uuid,uuid,text,text,uuid,uuid)",
  "create_stock_transfer(uuid,uuid,uuid,date,text,jsonb,uuid)",
  "delete_bin(uuid,uuid,uuid)",
  "delete_brewery_state_license(uuid,uuid,uuid)",
  "delete_material_contract(uuid,uuid,uuid)",
  "delete_vessel(uuid,uuid,uuid)",
  "delete_catalog_category(uuid,text,uuid)",
  "delete_customer(uuid,uuid,uuid)",
  "delete_format(uuid,uuid,uuid)",
  "delete_price_group(uuid,uuid,uuid)",
  "delete_sale_channel(uuid,uuid,uuid)",
  "delete_ship_to(uuid,uuid,uuid)",
  "save_catalog_category(uuid,text,text,uuid)",
  "disable_chat_installation(uuid,uuid,uuid)",
  "disconnect_chat_installation(uuid,uuid,uuid)",
  "draft_purchase_order_from_requirements(uuid,uuid[],uuid)",
  "file_compliance_report(uuid,text,date,date,text,uuid)",
  "generate_compliance_report(uuid,text,date,date)",
  "get_loss_review(uuid,date,date)",
  "get_batch_completion_preview(uuid,uuid)",
  "get_batch_volume_balance(uuid,uuid)",
  "get_today_items(uuid,timestamp with time zone)",
  "is_staff_of(uuid)",
  "move_stock_bin(uuid,uuid,uuid,uuid,keg_size,numeric,uuid,uuid,text,uuid,uuid,uuid)",
  "my_brewery_ids()",
  "my_staff_brewery_ids(staff_role[])",
  "my_customer_ids()",
  "portal_availability(uuid)",
  "portal_brewery_rows()",
  "portal_customer_rows()",
  "portal_invoice_rows()",
  "portal_keg_deposit_rows()",
  "portal_order_event_rows()",
  "portal_order_rows(uuid)",
  "portal_shipment_rows()",
  "portal_sku_price_rows()",
  "portal_schedule_rows()",
  "portal_create_order(uuid,uuid,uuid,text,text,jsonb,uuid,date)",
  "portal_quote_order(uuid,uuid,uuid,date,text,text,jsonb,uuid)",
  "portal_submit_quote(uuid,uuid,uuid,uuid,uuid)",
  "receive_purchase_order(uuid,uuid,uuid,uuid,date,jsonb,uuid)",
  "correct_purchase_receipt(uuid,uuid,text,jsonb,uuid,uuid,uuid)",
  "receive_stock_transfer(uuid,jsonb,uuid)",
  "record_batch_addition(uuid,uuid,uuid,ingredient_stage,uuid,numeric,text,uuid)",
  "record_brew_day(uuid,uuid,uuid,numeric,date,uuid,jsonb,jsonb,boolean)",
  "correct_brew_record(uuid,uuid,text,numeric,jsonb,jsonb,boolean,uuid)",
  "get_brew_day_plan(uuid,uuid)", "get_brew_record(uuid,uuid)",
  "save_batch_pulls(uuid,uuid,uuid,jsonb,uuid)",
  "record_cellar_transfer(uuid,uuid,uuid,numeric,numeric,uuid)",
  "record_fermentation_reading(uuid,uuid,uuid,timestamp with time zone,numeric,numeric,numeric,text,uuid)",
  "record_historical_batch(uuid,uuid,date,date,numeric,jsonb,uuid)",
  "record_historical_packaging_run(uuid,uuid,date,jsonb,text,uuid)",
  "record_historical_order(uuid,uuid,uuid,date,jsonb,text,uuid)",
  "record_inventory_movement(uuid,uuid,uuid,uuid,numeric,movement_type,uuid,text,text,uuid,uuid,text,uuid,uuid)",
  "preview_inventory_movement(uuid,uuid,uuid,uuid,numeric,movement_type,uuid,text,text,uuid,uuid)",
  "create_chat_conversation(uuid,text,uuid)",
  "append_chat_message(uuid,uuid,text,text,uuid)",
  "list_chat_conversations(uuid)",
  "get_chat_history(uuid,uuid,integer)",
  "record_material_count(uuid,uuid,uuid,date,jsonb,uuid,text)",
  "get_material_count_preview(uuid,uuid,uuid,jsonb)",
  "record_pick(uuid,jsonb,uuid)",
  "record_repack(uuid,uuid,uuid,uuid,numeric,uuid,numeric,uuid,uuid)",
  "record_stock_transfer_pick(uuid,jsonb,uuid)",
  "record_submitted_order_occurrence(uuid)",
  "release_allocation(uuid,uuid)",
  "replace_format_bom(uuid,uuid,jsonb,uuid)",
  "replace_format_components(uuid,uuid,jsonb,uuid)",
  "resolve_short_pick(uuid,uuid,numeric,text,text,uuid)",
  "return_shipment(uuid,jsonb,uuid,text,uuid,uuid,boolean,uuid)",
  "reorder_refused_delivery(uuid,uuid)",
  "reverse_inventory_movement(uuid,uuid,text,uuid)",
  "cancel_batch(uuid,uuid,uuid)",
  "reschedule_batch(uuid,uuid,date,uuid)",
  "cancel_packaging_run(uuid,uuid,uuid)",
  "reschedule_packaging_run(uuid,uuid,date,uuid)",
  "schedule_batch(uuid,uuid,uuid,date,numeric,text,uuid)",
  "schedule_packaging_run(uuid,uuid,date,uuid,jsonb,uuid)",
  "send_purchase_order(uuid,uuid,text,uuid)",
  "set_brewery_gravity_unit(uuid,text,uuid)",
  "set_brewery_quiet_hours(uuid,uuid,time without time zone,time without time zone,uuid)",
  "set_my_gravity_unit(uuid,text,uuid)",
  "set_personal_notification_destination(uuid,text,uuid,uuid)",
  "set_notification_preference(uuid,text,boolean,time without time zone,time without time zone,text,boolean,uuid)",
  "set_portal_fulfillment_source(uuid,uuid,uuid)",
  "set_pos_item_mapping(uuid,text,text,uuid,uuid,boolean,uuid)",
  "set_pos_location_mapping(uuid,text,uuid,uuid)",
  "retire_pos_location_mapping(uuid,text,uuid)",
  "set_pos_price_override(uuid,text,uuid,uuid,integer,uuid)",
  "set_pos_website_publication(uuid,text,uuid,uuid,boolean,uuid)",
  "set_channel_price(uuid,uuid,uuid,uuid,integer,uuid)",
  "set_price_group_barcode(uuid,uuid,uuid,text,uuid)",
  "set_standing_allocation(uuid,uuid,numeric,uuid)",
  "set_taproom_par(uuid,uuid,uuid,numeric,uuid)",
  "ship_order(uuid,jsonb,text,text,uuid,text)",
  "staff_roles(uuid)",
  "has_staff_role(uuid,staff_role[])",
  "submit_order(uuid,uuid,uuid,uuid)",
  "cancel_stock_transfer(uuid,text,uuid)",
  "today_live_reasons()",
  "unlink_chat_user(uuid,uuid,uuid)",
  "set_personal_quiet_hours(uuid,time without time zone,time without time zone,text,uuid)",
  "snooze_notification(uuid,uuid,timestamp with time zone,uuid)",
  "update_bin(uuid,uuid,text,uuid)",
  "update_draft_order(uuid,uuid,date,text,text,jsonb,uuid,boolean,uuid,uuid,boolean)",
  "update_location(uuid,uuid,text,location_kind[],uuid)",
  "update_purchase_order(uuid,uuid,uuid,date,jsonb,uuid)",
  "update_sku(uuid,uuid,boolean,text,uuid,uuid,boolean,numeric,boolean)",
  "update_brewery(uuid,text,text,text,text,integer,uuid)",
  "list_team_members(uuid)",
  "update_staff_role(uuid,uuid,staff_role[],uuid)",
  "revoke_staff(uuid,uuid,uuid)",
  "list_customer_users(uuid,uuid)",
  "customers_missing_portal_email(uuid)",
  "revoke_customer_user(uuid,uuid,uuid,uuid)",
  "raise_invoice_question(uuid,uuid,text,uuid)",
  "reattribute_loss(uuid,uuid,numeric,cellar_removal_class,text,uuid)",
  "resolve_invoice_question(uuid,uuid,uuid)",
  "update_packaging_run(uuid,uuid,uuid,jsonb,timestamp with time zone,uuid)",
  "upsert_brand(uuid,uuid,text,text,numeric,text,text,uuid,text,uuid,text)",
  "set_recipe_brand(uuid,uuid,uuid,uuid)",
  "upsert_brand_approval(uuid,uuid,uuid,approval_kind,text,date,date,text,uuid,text[],text,text)",
  "upsert_brewery_state_license(uuid,text,text,text,date,text,uuid,text[])",
  "upsert_customer(uuid,uuid,text,customer_type,text,uuid,text,text,tax_treatment,uuid,text,text)",
  "upsert_format(uuid,uuid,text,format_basis,package_type,keg_size,integer,numeric,uuid,uuid,numeric)",
  "upsert_material(uuid,uuid,text,material_category,uom,uom,numeric,boolean,uuid,numeric,boolean,numeric,uuid)",
  "upsert_material_contract(uuid,uuid,uuid,uuid,numeric,integer,date,date,text,uuid)",
  "upsert_price_group(uuid,uuid,text,integer,integer,uuid)",
  "upsert_sale_channel(uuid,uuid,text,tax_treatment,uuid)",
  "upsert_ship_to(uuid,uuid,uuid,text,text,text,text,text,text,uuid,boolean,text)",
  "upsert_state_registration(uuid,uuid,text,text,date,date,uuid,text[])",
  "upsert_vendor(uuid,uuid,text,text,text,integer,text,boolean,uuid)",
  "upsert_vessel(uuid,uuid,text,vessel_kind,numeric,uuid)",
  "upsert_water_profile(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,uuid)",
];

describe("authenticated RPC allowlist", () => {
  it("matches the public functions authenticated can execute", () => {
    const actual = sql(`
      select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and has_function_privilege('authenticated', p.oid, 'execute')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      order by 1`);
    // same comparator on both sides: Postgres collation orders punctuation differently from JS
    expect([...actual].sort()).toEqual([...AUTHENTICATED_RPCS].sort());
  });
});

it("grants the caller-RLS Beer aggregate only to authenticated callers", () => {
  expect(sql(`select r.role from pg_proc p
    cross join (values ('anon'),('authenticated'),('service_role')) r(role)
    where p.pronamespace = 'public'::regnamespace and p.proname = 'get_beer_overview_aggregates'
      and has_function_privilege(r.role,p.oid,'execute') order by 1`)).toEqual(["authenticated"]);
});

it("grants caller-RLS keg aging only to authenticated callers", () => {
  expect(sql(`select r.role from pg_proc p
    cross join (values ('anon'),('authenticated'),('service_role')) r(role)
    where p.pronamespace = 'public'::regnamespace and p.proname = 'get_keg_report_aging'
      and has_function_privilege(r.role,p.oid,'execute') order by 1`)).toEqual(["authenticated"]);
});


it("grants action issuance and receipt consumption only to the service owner", () => {
  expect(sql(`select p.proname || ':' || r.role from pg_proc p
    cross join (values ('anon'),('authenticated'),('service_role')) r(role)
    where p.pronamespace='public'::regnamespace and p.proname in ('issue_chat_action_intent','consume_chat_action_intent')
      and has_function_privilege(r.role,p.oid,'execute') order by 1`)).toEqual([
    "consume_chat_action_intent:service_role", "issue_chat_action_intent:service_role",
  ]);
});

it("grants brewery bootstrap only to the service owner (#467)", () => {
  expect(sql(`select p.oid::regprocedure::text || ':' || r.role from pg_proc p
    cross join (values ('anon'),('authenticated'),('service_role')) r(role)
    where p.pronamespace='public'::regnamespace and p.proname = 'provision_brewery'
      and has_function_privilege(r.role,p.oid,'execute') order by 1`)).toEqual([
    "provision_brewery(uuid,text,text,text,uuid):service_role",
  ]);
});

it("grants portal tax credential access only to the service owner", () => {
  expect(sql(`select p.proname || ':' || r.role from pg_proc p
    cross join (values ('anon'),('authenticated'),('service_role')) r(role)
    where p.pronamespace='public'::regnamespace and p.proname in ('read_portal_quote_tax','finish_portal_quote_tax')
      and has_function_privilege(r.role,p.oid,'execute') order by 1`)).toEqual([
    "finish_portal_quote_tax:service_role", "read_portal_quote_tax:service_role",
  ]);
});

it("grants Square credential lifecycle and snapshot writes only to the service owner", () => {
  expect(sql(`select p.proname || ':' || r.role from pg_proc p
    cross join (values ('anon'),('authenticated'),('service_role')) r(role)
    where p.pronamespace='public'::regnamespace and p.proname in (
      'claim_square_oauth','complete_square_oauth','fail_square_oauth',
      'advance_square_catalog_sync','advance_square_sales_sync','mark_square_authorization_failed',
      'record_square_catalog_snapshot','record_square_sales_locations','record_square_sales_page',
      'begin_square_disconnect','finish_square_disconnect')
      and has_function_privilege(r.role,p.oid,'execute') order by 1`)).toEqual([
    "advance_square_catalog_sync:service_role", "advance_square_sales_sync:service_role",
    "begin_square_disconnect:service_role", "claim_square_oauth:service_role",
    "complete_square_oauth:service_role", "fail_square_oauth:service_role",
    "finish_square_disconnect:service_role", "mark_square_authorization_failed:service_role",
    "record_square_catalog_snapshot:service_role", "record_square_sales_locations:service_role",
    "record_square_sales_page:service_role",
  ]);
});

it("grants chat oauth activation and job RPCs only to the service owner", () => {
  expect(sql(`select p.proname || ':' || r.role from pg_proc p
    cross join (values ('anon'),('authenticated'),('service_role')) r(role)
    where p.pronamespace='public'::regnamespace and p.proname in (
      'activate_chat_installation','find_chat_oauth_intent',
      'mark_chat_installation_reauthorization','reconcile_chat_installation',
      'set_notification_destination','get_chat_settings_installation',
      'chat_credential_has_canonical_owner','has_active_canonical_chat_installation',
      'get_chat_installation_lifecycle')
      and has_function_privilege(r.role,p.oid,'execute') order by 1`)).toEqual([
    "activate_chat_installation:service_role",
    "chat_credential_has_canonical_owner:service_role",
    "find_chat_oauth_intent:service_role",
    "get_chat_installation_lifecycle:service_role",
    "get_chat_settings_installation:service_role",
    "has_active_canonical_chat_installation:service_role",
    "mark_chat_installation_reauthorization:service_role",
    "reconcile_chat_installation:service_role",
    "set_notification_destination:service_role",
  ]);
});
