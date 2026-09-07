// tests/rpc-allowlist.test.ts — every public RPC an authenticated user can
// execute, pinned by signature. A grant that is not listed here is a new
// product surface: add it in the same commit as its command, or it fails.
import { describe, expect, it } from "vitest";
import { sql } from "./helpers";

const AUTHENTICATED_RPCS = [
  "activate_chat_installation(uuid,text,text,text,text,text,text,jsonb)",
  "adjust_order_lines(uuid,jsonb,text,uuid)",
  "begin_chat_installation(uuid,text,text,text)",
  "begin_chat_reauthorization(uuid,text,text)",
  "cancel_order(uuid,text,uuid)",
  "confirm_delivery(uuid,text,uuid)",
  "confirm_order(uuid,uuid)",
  "confirm_restock(uuid,uuid)",
  "consume_chat_link_proof(text)",
  "create_bin(uuid,uuid,text,uuid)",
  "create_credit_memo(uuid,jsonb,uuid,text,uuid)",
  "create_location(uuid,text,location_kind,uuid)",
  "create_order(uuid,order_kind,uuid,uuid,uuid,uuid,date,text,text,jsonb,uuid)",
  "create_product(uuid,text,text,numeric,uuid)",
  "create_replenishment_order(uuid,uuid,jsonb,uuid)",
  "create_sku(uuid,uuid,text,package_type,integer,numeric,uuid)",
  "create_stock_transfer(uuid,uuid,uuid,date,text,jsonb,uuid)",
  "delete_bin(uuid,uuid,uuid)",
  "disable_chat_installation(uuid)",
  "disconnect_chat_installation(uuid)",
  "find_chat_oauth_intent(text)",
  "get_today_items(uuid,timestamp with time zone)",
  "is_staff_of(uuid)",
  "mark_chat_installation_reauthorization(uuid,text)",
  "move_stock_bin(uuid,uuid,uuid,uuid,keg_size,numeric,uuid,uuid,text,uuid)",
  "my_brewery_ids()",
  "my_customer_ids()",
  "portal_availability(uuid)",
  "portal_brewery_rows()",
  "portal_create_order(uuid,uuid,uuid,text,text,jsonb,uuid)",
  "receive_stock_transfer(uuid,jsonb,uuid)",
  "reconcile_chat_installation(uuid,boolean,text)",
  "record_inventory_movement(uuid,uuid,uuid,uuid,numeric,movement_type,sale_channel,text,text,uuid)",
  "record_pick(uuid,jsonb,uuid)",
  "record_stock_transfer_pick(uuid,jsonb,uuid)",
  "record_submitted_order_occurrence(uuid)",
  "release_allocation(uuid,uuid)",
  "resolve_short_pick(uuid,uuid,numeric,text,text,uuid)",
  "return_shipment(uuid,jsonb,uuid,text,uuid)",
  "set_brewery_quiet_hours(uuid,time without time zone,time without time zone)",
  "set_notification_destination(uuid,text)",
  "set_notification_preference(uuid,text,boolean,time without time zone,time without time zone,text)",
  "set_portal_fulfillment_source(uuid,uuid,uuid)",
  "set_price(uuid,uuid,uuid,integer,uuid)",
  "set_standing_allocation(uuid,uuid,numeric,uuid)",
  "set_taproom_par(uuid,uuid,uuid,numeric,uuid)",
  "ship_order(uuid,jsonb,text,text,uuid,text)",
  "staff_role(uuid)",
  "submit_order(uuid,uuid)",
  "submit_stock_transfer(uuid,uuid)",
  "today_live_reasons()",
  "unlink_chat_user(uuid)",
  "update_bin(uuid,uuid,text,uuid)",
  "update_draft_order(uuid,uuid,date,text,text,jsonb,uuid)",
  "update_location(uuid,uuid,text,location_kind,uuid)",
  "upsert_customer(uuid,uuid,text,customer_type,text,uuid,text,text,uuid)",
  "upsert_price_list(uuid,uuid,text,uuid)",
  "upsert_ship_to(uuid,uuid,uuid,text,text,text,text,text,text,uuid)",
];

describe("authenticated RPC allowlist", () => {
  it("matches the public functions authenticated can execute", () => {
    const actual = sql(`
      select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and has_function_privilege('authenticated', p.oid, 'execute')
        and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      order by 1`);
    expect(actual).toEqual(AUTHENTICATED_RPCS);
  });
});
