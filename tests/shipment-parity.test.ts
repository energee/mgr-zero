import { beforeEach, expect, it, vi } from "vitest";
const { query, permission } = vi.hoisted(() => ({ query: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ breweryId: "brewery" }) }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query, requirePagePermission: permission }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(href); } }));
import ShipPage from "@/app/(app)/orders/[id]/ship/page";
import CompleteTransferPage from "@/app/(app)/orders/[id]/complete/page";
import { ShipForm, buildShipLines, type ShippingSnapshot } from "@/app/(app)/orders/[id]/ship-form";
import { ShipmentDoneView } from "@/components/mgr/views/shipment-done";
import type { ShipSources } from "@/lib/commands/orders";

const params = Promise.resolve({ id: "order" });
const order = { id: "order", order_no: 23, kind: "wholesale", status: "picked", from_location_id: "warehouse", to_location_id: null };
const lines: ShippingSnapshot["lines"] = [
  { id: "a", sku_id: "sku-a", qty_ordered: 3, qty_picked: 3, qty_shipped: null, skus: { name: "Exact can SKU" } },
  { id: "b", sku_id: "sku-b", qty_ordered: 2, qty_picked: 2, qty_shipped: null, skus: { name: "Other SKU" } },
];
const available: ShipSources = { bins: [{ id: "bin", name: "Cooler", location_id: "warehouse" }], destinationBins: [],
  stock: [
    { stock_id: "sku-b", bin_id: "wrong", lot_id: null, kind: "sku", keg_size: null, name: "Other SKU", unit: "can", lot_code: null, qty: 2 },
    { stock_id: "sku-a", bin_id: "bin", lot_id: null, kind: "sku", keg_size: null, name: "Exact can SKU", unit: "can", lot_code: null, qty: 3 },
  ] };
beforeEach(() => {
  query.mockReset(); permission.mockReset();
  query.mockImplementation(async name => {
    if (name === "get_order") return { order, lines, events: [], shipment: null };
    if (name === "list_locations") return [{ id: "warehouse", name: "Actual warehouse" }];
    if (name === "get_order_ship_sources") return available;
    throw new Error(name);
  });
});

it("preserves explicit bin/lot identities, decimals, transfer destinations and held-back zero lines", () => {
  expect(buildShipLines(lines, { a: "1.5", b: "0" }, {
    a: [{ key: "bin:", qty: "1.5", toBinId: "destination" }],
    b: [{ key: "wrong:", qty: "2", toBinId: "" }],
  }, available)).toEqual([
    { lineId: "a", qty: 1.5, sources: [{ binId: "bin", lotId: null, qty: 1.5, toBinId: "destination" }] },
    { lineId: "b", qty: 0, sources: [] },
  ]);
  expect(buildShipLines(lines, { a: "1", b: "0" }, { a: [{ key: "wrong:", qty: "1", toBinId: "" }] }, available)[0].sources[0].binId).toBeUndefined();
});

it("guards both shipment pages before reading data", async () => {
  permission.mockImplementation(() => { throw new Error("denied"); });
  await expect(ShipPage({ params })).rejects.toThrow("denied");
  await expect(CompleteTransferPage({ params })).rejects.toThrow("denied");
  expect(query).not.toHaveBeenCalled();
});

it("supplies actual source options and redirects a transfer to its own flow", async () => {
  const page = await ShipPage({ params });
  expect(page.type).toBe(ShipForm);
  expect(page.props.available).toBe(available);
  expect(page.props.snapshot.lines).toBe(lines);
  await expect(CompleteTransferPage({ params })).rejects.toThrow("/orders/order");
});

it.each(["now", "on_delivery"] as const)("shows durable confirmation after route refresh (%s)", async invoiceTiming => {
  query.mockImplementation(async name => {
    if (name === "get_order") return {
      order: { ...order, status: "shipped" }, lines: lines.map(line => ({ ...line, qty_shipped: 1 })),
      shipment: { invoice_timing: invoiceTiming }, events: [{ event: "shipped", payload: { invoice_id: invoiceTiming === "now" ? "invoice" : null } }],
    };
    if (name === "list_locations") return [];
    if (name === "get_invoice") return { invoice: { invoice_no: 83 } };
    throw new Error(name);
  });
  const page = await ShipPage({ params });
  expect(page.type).toBe(ShipmentDoneView);
  expect(page.props.model.invoice).toBe(invoiceTiming === "now" ? "INV-0083 · assigned" : "Deferred to delivery");
  expect(page.props.model.invoiceHref).toBe(invoiceTiming === "now" ? "/invoices/invoice" : undefined);
  expect(query.mock.calls.some(call => call[0] === "get_order_ship_sources")).toBe(false);
});
