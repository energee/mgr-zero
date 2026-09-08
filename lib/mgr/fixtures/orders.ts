// lib/mgr/fixtures/orders.ts — get_order-shaped snapshots for inventory
// frames. Views never own sample data: screens pass toXViewProps(snapshot).
import { formatVolume } from "@/lib/volume";
import { ALS, LOC_TAPROOM, LOC_WAREHOUSE, LOCATIONS, RIDGELINE, SKU_HAZY, SKU_PILS, SKU_STOUT } from "./demo";
import type { CompleteTransferSnapshot } from "@/lib/mgr/complete-transfer-view";
import type { ConfirmOrderSnapshot } from "@/lib/mgr/confirm-order-view";
import type { OrderSnapshot } from "@/lib/mgr/order-view";
import type { PutBackSnapshot } from "@/lib/mgr/put-back-view";

const ORDER_229 = "00000000-0000-4000-8000-000000000229";
const ORDER_231 = "00000000-0000-4000-8000-000000000231";
const ORDER_088 = "00000000-0000-4000-8000-000000000088";

const line = (
  id: string,
  sku: { sku_id: string; name: string; unit_price_cents: number },
  qty_ordered: number,
  qty_picked: number | null,
) => ({
  id,
  sku_id: sku.sku_id,
  qty_ordered,
  qty_picked,
  qty_shipped: null,
  unit_price_cents: sku.unit_price_cents,
  skus: { name: sku.name },
});

/** Picked wholesale order after a line was adjusted down (Order + Put back). */
export const orderPickedRestock: OrderSnapshot = {
  order: {
    id: ORDER_229,
    order_no: 229,
    kind: "wholesale",
    status: "picked",
    po_number: "4471",
    requested_ship_date: null,
    note: null,
    needs_restock: true,
    from_location_id: LOC_WAREHOUSE.id,
    customers: { name: ALS.name },
    ship_tos: ALS.shipTo,
  },
  lines: [
    line("l-hazy", SKU_HAZY, 4, 4),
    line("l-pils", SKU_PILS, 7, 10),
    line("l-stout", SKU_STOUT, 2, 2),
  ],
  events: [
    { id: "e1", event: "created", actor: "Ted", payload: {}, created_at: "2026-09-01T13:02:00.000Z" },
    { id: "e2", event: "submitted", actor: "Ted", payload: {}, created_at: "2026-09-01T13:05:00.000Z" },
    { id: "e3", event: "confirmed", actor: "Maria", payload: {}, created_at: "2026-09-01T18:10:00.000Z" },
    { id: "e4", event: "picked", actor: "Dave", payload: {}, created_at: "2026-09-02T12:40:00.000Z" },
    {
      id: "e5",
      event: "lines_adjusted",
      actor: "Ted",
      payload: { before: { [SKU_PILS.sku_id]: 10 }, lines: { [SKU_PILS.sku_id]: 7 }, reason: "customer cut" },
      created_at: "2026-09-02T13:15:00.000Z",
    },
  ],
  atp: [
    { sku_id: SKU_HAZY.sku_id, qty: 11 },
    { sku_id: SKU_STOUT.sku_id, qty: 7 },
  ],
  locations: LOCATIONS,
};

export const orderPickedRestockPutBack: PutBackSnapshot = {
  order: {
    id: orderPickedRestock.order.id,
    order_no: orderPickedRestock.order.order_no,
    status: orderPickedRestock.order.status,
    needs_restock: orderPickedRestock.order.needs_restock,
  },
  lines: orderPickedRestock.lines,
};

/** Submitted wholesale order with an oversell (Confirm order). */
export const orderSubmittedRidgeline: ConfirmOrderSnapshot = {
  order: {
    id: ORDER_231,
    order_no: 231,
    status: "submitted",
    requested_ship_date: "2026-09-10",
    from_location_id: LOC_WAREHOUSE.id,
    customers: { name: RIDGELINE.name },
  },
  lines: [
    { id: "l-hazy", sku_id: SKU_HAZY.sku_id, qty_ordered: 4, skus: { name: SKU_HAZY.name } },
    { id: "l-pils", sku_id: SKU_PILS.sku_id, qty_ordered: 10, skus: { name: SKU_PILS.name } },
  ],
  atp: [
    { sku_id: SKU_HAZY.sku_id, qty: 11 },
    { sku_id: SKU_PILS.sku_id, qty: -6 },
  ],
  locations: LOCATIONS,
};

/** Picked taproom transfer (Complete transfer). */
export const orderTransferComplete: CompleteTransferSnapshot = {
  order: {
    id: ORDER_088,
    order_no: 88,
    from_location_id: LOC_WAREHOUSE.id,
    to_location_id: LOC_TAPROOM.id,
  },
  lines: [
    { id: "l-pils", qty_ordered: 4, qty_picked: 4, skus: { name: SKU_PILS.name } },
    { id: "l-hazy", qty_ordered: 2, qty_picked: 2, skus: { name: SKU_HAZY.name } },
  ],
  locations: LOCATIONS,
};

/** Movement preview the live complete page does not yet compute. */
export const completeTransferTape: [string, string][] = [
  ["−4 Pils cases · taproom transfer · Warehouse", formatVolume("0.39")],
  ["+4 Pils cases · taproom transfer · Taproom", formatVolume("0.39")],
  ["−2 / +2 Hazy ½ bbl · taproom transfer", formatVolume("1.00")],
];
