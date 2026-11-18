// lib/mgr/fixtures/order-changes.ts — list_order_changes-shaped rows for the
// Changes after confirm inventory frame. Fictional customers, staff and beer.
import type { OrderChangesSnapshot } from "@/lib/mgr/order-changes-view";
import { ALS, RIDGELINE, SKU_HAZY, SKU_PILS } from "./demo";
import { DEMO_TIME_ZONE } from "./settings";

const MARIA = "00000000-0000-4000-8000-0000000000a1";
const DAVE = "00000000-0000-4000-8000-0000000000a2";
const RIDGELINE_ID = "00000000-0000-4000-8000-0000000000b1";
const ALS_ID = "00000000-0000-4000-8000-0000000000b2";

/** Three changes after confirm, newest first, unfiltered. */
export const orderChangesReport: OrderChangesSnapshot = {
  timeZone: DEMO_TIME_ZONE,
  staffNames: { [MARIA]: "Maria", [DAVE]: "Dave" },
  rows: [
    {
      id: "00000000-0000-4000-8000-0000000000c3", created_at: "2026-09-03T14:20:00.000Z",
      order_id: "00000000-0000-4000-8000-000000000231", order_no: 231, customer_id: RIDGELINE_ID, customer_name: RIDGELINE.name,
      actor: MARIA, reason_code: "customer_request", note: null,
      changes: [{ sku_id: SKU_PILS.sku_id, name: SKU_PILS.name, delta: 2 }],
    },
    {
      id: "00000000-0000-4000-8000-0000000000c2", created_at: "2026-09-02T17:15:00.000Z",
      order_id: "00000000-0000-4000-8000-000000000228", order_no: 228, customer_id: ALS_ID, customer_name: ALS.name,
      actor: DAVE, reason_code: "damaged", note: "Two kegs dented on the dock",
      changes: [{ sku_id: SKU_HAZY.sku_id, name: SKU_HAZY.name, delta: -2 }],
    },
    {
      id: "00000000-0000-4000-8000-0000000000c1", created_at: "2026-09-01T15:40:00.000Z",
      order_id: "00000000-0000-4000-8000-000000000225", order_no: 225, customer_id: RIDGELINE_ID, customer_name: RIDGELINE.name,
      actor: MARIA, reason_code: "short", note: null,
      changes: [{ sku_id: SKU_HAZY.sku_id, name: SKU_HAZY.name, delta: -1 }],
    },
  ],
};
