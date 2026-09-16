// JSON-returning RPC contracts: generated Postgres types only describe these as
// Json. Keep these shapes beside the database boundary, shared by every caller.
import type { Database } from "./database.generated";
import type { TaproomCountSnapshot } from "@/lib/mgr/taproom-count-state";
import type { CommandPreview } from "@/lib/commands/registry";

type Row<Name extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][Name]["Row"];
export type TaproomCount = {
  id: string; root_id: string; effective_id: string; location_id: string;
  counted_on: string; observed_at: string; counted_by: string; created_at: string;
  prior_count_id: string | null; corrected_at: string | null; corrected_by: string | null;
  correction_reason: string | null; correction_eligible: boolean;
  lines: (Row<"taproom_count_lines"> & {
    bbl: number | null; effective_line_id: string; corrects_line_id: string | null; bin_name: string | null; sku_name: string | null;
  })[];
};

export type RpcResults = {
  create_order: { order_id: string };
  create_stock_transfer: { transfer_id: string };
  import_csv_row: { status: string };
  find_chat_oauth_intent: import("@/lib/chat/oauth").Intent | null;
  get_chat_installation_lifecycle: { state: string; external_installation_id: string } | null;
  begin_chat_installation: { installation_id: string };
  begin_chat_reauthorization: { installation_id: string };
  activate_chat_installation: { installation_id: string; replayed: boolean };
  get_chat_delivery_context: import("@/lib/chat/jobs").DeliveryContext | null;
  get_chat_home_items: import("@/lib/chat/jobs").Occurrence[] | null;
  get_chat_integration_health: import("@/lib/commands/chat").ChatHealth;
  record_chat_callback_receipt: { receipt_id: string; installation_id: string; brewery_id: string; disposition: string; duplicate: boolean; result: RpcResults["consume_chat_action_intent"] | null } | null;
  consume_chat_action_intent: { disposition: string; intentId?: string; quietHours?: { start: string | null; end: string | null; timezone: string | null } };
  start_qbo_push: import("@/lib/qbo").QboPushStart;

  get_taproom_count_snapshot: TaproomCountSnapshot;
  get_taproom_count: TaproomCount;
  record_taproom_count: TaproomCount;
  correct_taproom_count: TaproomCount;
  tap_keg: Row<"tap_intervals">;
  kick_keg: Row<"tap_intervals">;
  swap_keg: { outgoing: Row<"tap_intervals">; incoming: Row<"tap_intervals"> };
  preview_inventory_movement: CommandPreview;
  upsert_format: Row<"formats">;
  create_sku: Row<"skus">;
  update_sku: Row<"skus">;
  upsert_ship_to: Row<"ship_tos">;
  claim_invite_request: { email: string; authToken: string; userId: string | null; state: string };
};
