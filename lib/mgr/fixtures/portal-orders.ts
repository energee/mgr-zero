// lib/mgr/fixtures/portal-orders.ts — portal_orders / portal_order snapshots
// for Order history and Order detail. Identities come from demo.ts.
import { RIDGELINE, SKU_HAZY, SKU_PILS } from "./demo";
import type { PortalOrderSnapshot } from "@/lib/mgr/portal-order-view";
import type { PortalOrdersSnapshot } from "@/lib/mgr/portal-orders-view";

const ORDER_231 = "00000000-0000-4000-8000-000000000231";
const ORDER_225 = "00000000-0000-4000-8000-000000000225";
const ORDER_221 = "00000000-0000-4000-8000-000000000221";
const INVOICE_1037 = "00000000-0000-4000-8000-000000001037";

const ridgelineShipTo = { label: "Main", city: "Phoenixville", state: "PA" } as const;

const line = (
  id: string,
  sku: { sku_id: string; name: string; unit_price_cents: number },
  qty_ordered: number,
  qty_shipped: number | null,
) => ({
  id,
  sku_id: sku.sku_id,
  qty_ordered,
  qty_shipped,
  unit_price_cents: sku.unit_price_cents,
  skus: { name: sku.name },
});

/** Ridgeline's three history rows: confirmed ORD-0231, shipped ORD-0225, short ORD-0221. */
export const portalOrdersList: PortalOrdersSnapshot = {
  customerName: RIDGELINE.name,
  breweryName: "Demo Brewing",
  orders: [
    {
      id: ORDER_231,
      order_no: 231,
      status: "confirmed",
      requested_ship_date: "2026-09-10",
      order_lines: [
        line("l-hazy-231", SKU_HAZY, 4, null),
        line("l-pils-231", SKU_PILS, 6, null),
        line("l-dep-231", { sku_id: "00000000-0000-4000-8000-0000000000d1", name: "Keg deposit", unit_price_cents: 3000 }, 4, null),
      ],
    },
    {
      id: ORDER_225,
      order_no: 225,
      status: "shipped",
      requested_ship_date: null,
      order_lines: [
        line("l-hazy-225", SKU_HAZY, 2, 2),
        line("l-pils-225", SKU_PILS, 6, 6),
      ],
    },
    {
      id: ORDER_221,
      order_no: 221,
      status: "shipped",
      requested_ship_date: null,
      order_lines: [
        line("l-hazy-221", SKU_HAZY, 2, 2),
        line("l-pils-221", SKU_PILS, 8, 6),
      ],
    },
  ],
};

/** Shipped ORD-0225 with paid INV-1037 — the Order detail inventory drawing. */
export const portalOrderShipped: PortalOrderSnapshot = {
  order: {
    id: ORDER_225,
    order_no: 225,
    status: "shipped",
    po_number: null,
    requested_ship_date: null,
    note: null,
    ship_tos: ridgelineShipTo,
  },
  lines: [
    line("l-hazy-225", SKU_HAZY, 2, 2),
    line("l-pils-225", SKU_PILS, 6, 6),
  ],
  events: [
    { id: "e-ship", event: "shipped", payload: {}, created_at: "2026-08-27T16:00:00.000Z" },
  ],
  shipment: {
    id: "00000000-0000-4000-8000-000000000325",
    invoices: [{
      id: INVOICE_1037,
      invoice_no: 1037,
      kind: "invoice",
      paid_at: "2026-08-29T16:00:00.000Z",
      invoice_lines: [{ amount_cents: 98000 }],
    }],
  },
};
