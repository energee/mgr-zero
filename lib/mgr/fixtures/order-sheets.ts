// lib/mgr/fixtures/order-sheets.ts — get_order-shaped snapshots for the
// Adjust / Short pick / Pick / Ship / Shipment done / Return sheets. Identities
// come from demo.ts; order numbers match fixtures/orders.ts (229, 231).
import { OUNCES_PER_BBL } from "@/lib/volume";
import { ALS, LOC_TAPROOM, LOC_WAREHOUSE, LOCATIONS, RIDGELINE, SKU_HAZY, SKU_PILS, SKU_STOUT } from "./demo";
import type { AdjustLinesSnapshot } from "@/lib/mgr/adjust-lines-view";
import type { PickSnapshot } from "@/lib/mgr/pick-view";
import type { ReturnCreditSnapshot } from "@/lib/mgr/return-credit-view";
import type { ShipSnapshot } from "@/lib/mgr/ship-view";
import type { ShipmentDoneSnapshot } from "@/lib/mgr/shipment-done-view";
import type { ShortPickSnapshot } from "@/lib/mgr/short-pick-view";

const ORDER_229 = "00000000-0000-4000-8000-000000000229";
const ORDER_231 = "00000000-0000-4000-8000-000000000231";

const BBL_HAZY = 0.5;
const BBL_PILS = (24 * 16) / OUNCES_PER_BBL;

const ridgeline = {
  id: ORDER_231,
  order_no: 231,
  from_location_id: LOC_WAREHOUSE.id,
  customers: { name: RIDGELINE.name },
  ship_tos: { label: "Main", city: "Phoenixville", state: "PA" },
};

const line = (
  id: string,
  sku: { sku_id: string; name: string; unit_price_cents: number },
  qty_ordered: number,
  qty_picked: number | null,
  qty_shipped: number | null = null,
  bbl_per_unit?: number,
) => ({
  id,
  sku_id: sku.sku_id,
  qty_ordered,
  qty_picked,
  qty_shipped,
  unit_price_cents: sku.unit_price_cents,
  bbl_per_unit,
  skus: { name: sku.name },
});

/** Picked Al’s order mid-adjust: Pils stepper is the new 7, picked 10 warns. */
export const orderAdjustLines: AdjustLinesSnapshot = {
  order: { id: ORDER_229, order_no: 229, customers: { name: ALS.name } },
  lines: [
    line("l-hazy", SKU_HAZY, 4, 4),
    line("l-pils", SKU_PILS, 7, 10),
    line("l-stout", SKU_STOUT, 2, 2),
  ],
};

/** Warehouse pick of Ridgeline: counts start at ordered. */
export const orderPick: PickSnapshot = {
  order: { id: ORDER_231, order_no: 231, from_location_id: LOC_WAREHOUSE.id },
  lines: [
    line("l-hazy", SKU_HAZY, 4, null),
    line("l-pils", SKU_PILS, 10, null),
    line("l-stout", SKU_STOUT, 2, null),
  ],
  locations: LOCATIONS,
};

/** Pils counted 7 of 10 on the Ridgeline pick. */
export const orderShortPick: ShortPickSnapshot = {
  order: {
    id: ORDER_231,
    order_no: 231,
    from_location_id: LOC_WAREHOUSE.id,
    customers: { name: RIDGELINE.name },
  },
  line: line("l-pils", SKU_PILS, 10, 7),
  locations: LOCATIONS,
};

/** Wholesale ship, Pils held back 1; invoice now. */
export const orderShipInvoice: ShipSnapshot = {
  order: ridgeline,
  lines: [
    line("l-hazy", SKU_HAZY, 4, 4, 4, BBL_HAZY),
    line("l-pils", SKU_PILS, 10, 10, 9, BBL_PILS),
  ],
  locations: LOCATIONS,
  invoiceTiming: "now",
};

/** Same ShipView, all-as-picked, invoice on delivery. */
export const orderShipOnDelivery: ShipSnapshot = {
  order: ridgeline,
  lines: [
    line("l-hazy", SKU_HAZY, 4, 4, 4, BBL_HAZY),
    line("l-pils", SKU_PILS, 10, 10, 10, BBL_PILS),
  ],
  locations: LOCATIONS,
  invoiceTiming: "on_delivery",
};

/** Post-commit of Ship and invoice: INV-1042 assigned. */
export const orderShipmentDone: ShipmentDoneSnapshot = {
  order: { id: ORDER_231, order_no: 231, ship_tos: ridgeline.ship_tos },
  invoice: { invoice_no: 1042 },
  lines: [
    { id: "l-hazy", qty_shipped: 4, bbl_per_unit: BBL_HAZY, skus: { name: SKU_HAZY.name } },
    { id: "l-pils", qty_shipped: 9, bbl_per_unit: BBL_PILS, skus: { name: SKU_PILS.name } },
  ],
};

/** One Hazy keg returning damaged against INV-1042; deposit $30. */
export const orderReturnCredit: ReturnCreditSnapshot = {
  order: { id: ORDER_231, order_no: 231, from_location_id: LOC_WAREHOUSE.id },
  invoice: { invoice_no: 1042 },
  lines: [{
    id: "l-hazy",
    qty_shipped: 4,
    qty_returning: 1,
    unit_price_cents: SKU_HAZY.unit_price_cents,
    skus: { name: SKU_HAZY.name },
  }],
  deposit: { label: "½ bbl pool · 1 · as deposited", cents: 3000 },
  locations: [LOC_WAREHOUSE, LOC_TAPROOM],
  reason: "damaged",
};

