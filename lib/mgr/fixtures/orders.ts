// lib/mgr/fixtures/orders.ts — get_order-shaped snapshots for inventory
// frames. Views never own sample data: screens pass toXViewProps(snapshot).
import { OUNCES_PER_BBL } from "@/lib/volume";
import { ALS, branded, LOC_TAPROOM, LOC_WAREHOUSE, LOCATIONS, RIDGELINE, SKU_HAZY, SKU_PILS, SKU_STOUT, TERESA } from "./demo";
import type { CompleteTransferSnapshot } from "@/lib/mgr/complete-transfer-view";
import type { ConfirmOrderSnapshot } from "@/lib/mgr/confirm-order-view";
import type { NewOrderSnapshot } from "@/lib/mgr/new-order-view";
import type { OrderSnapshot } from "@/lib/mgr/order-view";
import { DEMO_TIME_ZONE } from "./settings";
import type { OrdersListSnapshot } from "@/lib/mgr/orders-list-view";
import type { PutBackSnapshot } from "@/lib/mgr/put-back-view";

const ORDER_229 = "00000000-0000-4000-8000-000000000229";
const ORDER_231 = "00000000-0000-4000-8000-000000000231";
const ORDER_088 = "00000000-0000-4000-8000-000000000088";
const ORDER_234 = "00000000-0000-4000-8000-000000000234";
const ORDER_237 = "00000000-0000-4000-8000-000000000237";
const ORDER_248 = "00000000-0000-4000-8000-000000000248";
const ORDER_238 = "00000000-0000-4000-8000-000000000238";
const ORDER_TRANSFER = "00000000-0000-4000-8000-000000000240";

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
  one_way_fee_cents: null as number | null,
  skus: { name: sku.name },
});

/** Picked wholesale order after a line was adjusted down (Order + Put back). */
export const orderPickedRestock: OrderSnapshot = {
  timeZone: DEMO_TIME_ZONE,
  emailStatuses: [{ state: "pending", last_error: "provider_uncertain" }],
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
    { ...line("l-stout", SKU_STOUT, 2, 2), one_way_fee_cents: 800 },
  ],
  deposits: [{ order_line_id: "l-hazy", description: "Returnable keg deposit", qty_ordered: 4, unit_price_cents: 3000, amount_cents: 12000 }],
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

/** Confirmed wholesale order with every charge frozen: the #976 price-summary
 *  case. Prices are the ones captured on the lines, not the demo catalog's. */
export const orderConfirmedWholesale: OrderSnapshot = {
  timeZone: DEMO_TIME_ZONE,
  order: {
    id: ORDER_248,
    order_no: 248,
    kind: "wholesale",
    status: "confirmed",
    po_number: "RTR-AUTUMN-1042",
    requested_ship_date: "2026-10-20",
    note: "Use the side receiving entrance. Call the receiving desk before unloading.",
    needs_restock: false,
    from_location_id: LOC_WAREHOUSE.id,
    customers: { name: RIDGELINE.name },
    ship_tos: { label: "Main", country: "US", city: "Phoenixville", state: "PA" },
  },
  lines: [
    { ...line("l-hazy", { ...SKU_HAZY, unit_price_cents: 12500 }, 4, null) },
    { ...line("l-stout", { ...SKU_STOUT, unit_price_cents: 8000 }, 3, null), one_way_fee_cents: 800 },
    { ...line("l-pils", { ...SKU_PILS, unit_price_cents: 3600 }, 8, null) },
  ],
  deposits: [{ order_line_id: "l-hazy", description: "Returnable keg deposit", qty_ordered: 4, unit_price_cents: 3000, amount_cents: 12000 }],
  events: [
    { id: "e1", event: "created", actor: "Ted", payload: {}, created_at: "2026-10-16T13:02:00.000Z" },
    { id: "e2", event: "submitted", actor: "Ted", payload: {}, created_at: "2026-10-16T13:05:00.000Z" },
    { id: "e3", event: "confirmed", actor: "Maria", payload: {}, created_at: "2026-10-16T14:10:00.000Z" },
  ],
  atp: [
    { sku_id: SKU_HAZY.sku_id, qty: 11 },
    { sku_id: SKU_STOUT.sku_id, qty: 0 },
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
    { id: "l-hazy", sku_id: SKU_HAZY.sku_id, qty_ordered: 4, skus: branded(SKU_HAZY) },
    { id: "l-pils", sku_id: SKU_PILS.sku_id, qty_ordered: 10, skus: branded(SKU_PILS) },
  ],
  atp: [
    { sku_id: SKU_HAZY.sku_id, qty: 11 },
    { sku_id: SKU_PILS.sku_id, qty: -6 },
  ],
  sourceOnHand: [
    { sku_id: SKU_HAZY.sku_id, qty: 8 },
    { sku_id: SKU_PILS.sku_id, qty: 0 },
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
    { id: "l-pils", qty_ordered: 4, qty_picked: 4, bbl_per_unit: 384 / OUNCES_PER_BBL, skus: { name: SKU_PILS.name } },
    { id: "l-hazy", qty_ordered: 2, qty_picked: 2, bbl_per_unit: 0.5, skus: { name: SKU_HAZY.name } },
  ],
  locations: LOCATIONS,
};

/** Work → Orders list: one row per next action, plus a staged restock, a
 *  transfer without a customer or number, and an undated long customer name. */
export const ordersWorkList: OrdersListSnapshot = {
  roles: ["sales"],
  orders: [
    {
      id: ORDER_231,
      order_no: 231,
      status: "submitted",
      requested_ship_date: "2026-09-10",
      needs_restock: false,
      customers: { name: RIDGELINE.name },
    },
    {
      id: ORDER_229,
      order_no: 229,
      status: "picked",
      requested_ship_date: null,
      needs_restock: true,
      customers: { name: ALS.name },
    },
    {
      id: ORDER_234,
      order_no: 234,
      status: "confirmed",
      requested_ship_date: "2026-09-11",
      needs_restock: false,
      customers: { name: TERESA.name },
    },
    {
      id: ORDER_237,
      order_no: 237,
      status: "draft",
      requested_ship_date: "2026-09-11",
      needs_restock: false,
      customers: { name: TERESA.name },
    },
    {
      // No customer join and no number yet: the transfer and "Order" fallbacks.
      id: ORDER_TRANSFER,
      order_no: null,
      status: "confirmed",
      requested_ship_date: null,
      needs_restock: false,
      customers: null,
    },
    {
      // A long customer name wraps in full on the phone.
      id: ORDER_238,
      order_no: 238,
      status: "submitted",
      requested_ship_date: null,
      needs_restock: false,
      customers: { name: "North Orchard Neighborhood Market and Gathering Hall" },
    },
  ],
};

/** Staff New order sheet: Ridgeline draft with an oversold Pils line. */
export const newOrderDraft: NewOrderSnapshot = {
  customers: [RIDGELINE.name, ALS.name, TERESA.name],
  customer: RIDGELINE.name,
  shipTos: [...RIDGELINE.shipTos],
  shipTo: RIDGELINE.shipTos[0],
  sources: [LOC_WAREHOUSE.name, LOC_TAPROOM.name],
  source: LOC_WAREHOUSE.name,
  requestedShip: "2026-09-03",
  po: "4471",
  lines: [
    { name: SKU_HAZY.name, qty: 4, atp: 11 },
    { name: SKU_PILS.name, qty: 10, atp: -6 },
  ],
};

/** Movement preview the live complete page does not yet compute. */
