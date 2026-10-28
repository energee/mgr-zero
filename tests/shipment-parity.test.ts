import { beforeEach, expect, it, vi } from "vitest";
const { query, permission } = vi.hoisted(() => ({ query: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ breweryId: "brewery" }) }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query, requirePagePermission: permission }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(href); } }));
import ShipPage from "@/app/(app)/orders/[id]/ship/page";
import CompleteTransferPage from "@/app/(app)/orders/[id]/complete/page";
import { ShipForm, buildShipLines, shipmentSourceNeeds, shippedLines, type ShippingSnapshot } from "@/app/(app)/orders/[id]/ship-form";
import { toShipmentDoneViewProps } from "@/lib/mgr/shipment-done-view";
import { ShipmentDoneView } from "@/components/mgr/views/shipment-done";
import type { ShipSources } from "@/lib/commands/orders";
import { newShipmentSource } from "@/components/mgr/views/shipment-sources";
import { submitReason } from "@/lib/mgr/submit-reason";

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

it("explains missing and invalid shipment sources before submitting (#1385)", () => {
  const shipLines = [lines[0]];
  const quantities = { a: "2" };
  const needs = (rows: { key: string; qty: string; toBinId: string }[], transfer = false) =>
    shipmentSourceNeeds(shipLines, quantities, { a: rows }, available, transfer);
  expect(needs([])).toHaveLength(1);
  expect(needs([{ key: "", qty: "2", toBinId: "" }])).toHaveLength(1);
  expect(needs([{ key: "wrong:", qty: "2", toBinId: "" }])).toHaveLength(1);
  expect(needs([{ key: "bin:", qty: "", toBinId: "" }])).toHaveLength(1);
  const wrongTotal = needs([{ key: "bin:", qty: "3", toBinId: "" }]);
  expect(wrongTotal).toHaveLength(1);
  expect(wrongTotal[0]).toEqual(expect.stringContaining("2"));
  expect(wrongTotal[0]).toEqual(expect.stringContaining("3"));
  expect(needs([{ key: "bin:", qty: "1", toBinId: "" }, { key: "bin:", qty: "1", toBinId: "" }])).toHaveLength(1);
  expect(needs([{ key: "bin:", qty: "2", toBinId: "" }], true)).toHaveLength(1);
  expect(submitReason(needs([{ key: "bin:", qty: "2", toBinId: "destination" }], true))).toBeNull();
  expect(shipmentSourceNeeds(shipLines, { a: "0" }, {}, available, true)).toEqual([]);
  expect(shipmentSourceNeeds(shipLines, { a: "0.3" }, { a: [
    { key: "bin:", qty: "0.1", toBinId: "" }, { key: "second:", qty: "0.2", toBinId: "" },
  ] }, { ...available, stock: [...available.stock, { ...available.stock[1], bin_id: "second" }] }, false)).toEqual([]);
});

it("prefills each added source with the edited line's remaining quantity (#1385)", () => {
  expect(newShipmentSource(2, [])).toEqual({ key: "", qty: "2", toBinId: "" });
  expect(newShipmentSource(3, [{ key: "bin:", qty: "1.25", toBinId: "" }])).toEqual({ key: "", qty: "1.75", toBinId: "" });
  expect(newShipmentSource(0.3, [{ key: "bin:", qty: "0.1", toBinId: "" }]).qty).toBe("0.2");
  expect(newShipmentSource(2, [{ key: "bin:", qty: "3", toBinId: "" }]).qty).toBe("0");
});

it("sends a trimmed reason only for a line shipped below picked (#624)", () => {
  const built = buildShipLines(lines, { a: "1", b: "2" }, { a: [{ key: "bin:", qty: "1", toBinId: "" }], b: [{ key: "wrong:", qty: "2", toBinId: "" }] }, available, { a: " one can dented ", b: "ignored" });
  expect(built.map(line => line.shortReason)).toEqual(["one can dented", undefined]);
  expect(buildShipLines(lines, { a: "1", b: "2" }, {}, available, { a: "  " })[0].shortReason).toBeUndefined();
});

it("confirms only the reason ship_order was sent, not a leftover one on a full line", () => {
  const ship = buildShipLines(lines, { a: "1", b: "2" }, {}, available, { a: " one can dented ", b: "typed, then raised back to full" });
  const tape = toShipmentDoneViewProps({ order, invoice: null, lines: shippedLines(lines, ship) }).tape.map(row => row[0]);
  expect(tape[0]).toMatch(/· short: one can dented$/);
  expect(tape[1]).not.toMatch(/short:/);
});

it("keeps the saved short-pick reason when shipping the full picked amount", () => {
  const pickedLines = [{ ...lines[0], qty_ordered: 5, short_reason: "two cans unavailable" }];
  const ship = buildShipLines(pickedLines, { a: "3" }, {}, available, { a: "typed, then raised back to full" });
  const immediate = toShipmentDoneViewProps({ order, invoice: null, lines: shippedLines(pickedLines, ship) });
  const reloaded = toShipmentDoneViewProps({ order, invoice: null, lines: [{ ...pickedLines[0], qty_shipped: 3 }] });
  expect(immediate.tape).toEqual(reloaded.tape);
  expect(immediate.tape[0][0]).toMatch(/· short: two cans unavailable$/);
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
      shipment: { id: "shipment", invoice_timing: invoiceTiming, deliveries: [] }, events: [{ event: "shipped", payload: { invoice_id: invoiceTiming === "now" ? "invoice" : null, warnings: [{ pool: "Owned", keg_size: "half_bbl", location: "Warehouse", short: 2 }] } }],
    };
    if (name === "list_locations") return [];
    if (name === "get_invoice") return { invoice: { invoice_no: 83 } };
    throw new Error(name);
  });
  const page = await ShipPage({ params });
  expect(page.type).toBe(ShipmentDoneView);
  expect(page.props.model.invoice).toBe(invoiceTiming === "now" ? "INV-0083 · assigned" : "Deferred to delivery");
  expect(page.props.model.invoiceHref).toBe(invoiceTiming === "now" ? "/invoices/invoice" : undefined);
  expect(page.props.model.warnings).toEqual(["Owned ½ bbl · Warehouse: 2 kegs short · record Acquired kegs to reconcile"]);
  expect(page.props.model.routeHref).toBe("/routes/new?add=shipment");
  expect(query.mock.calls.some(call => call[0] === "get_order_ship_sources")).toBe(false);
});

it.each([
  ["already on a route", { pickup: false }, [{ outcome: null }]],
  ["a pickup", { pickup: true }, []],
])("offers no Add to route for a shipment %s (#1505)", async (_, flags, deliveries) => {
  query.mockImplementation(async name => {
    if (name === "get_order") return {
      order: { ...order, ...flags, status: "shipped" }, lines: lines.map(line => ({ ...line, qty_shipped: 1 })),
      shipment: { id: "shipment", invoice_timing: "now", deliveries }, events: [{ event: "shipped", payload: { invoice_id: null } }],
    };
    if (name === "list_locations") return [];
    throw new Error(name);
  });
  const page = await ShipPage({ params });
  expect(page.props.model.routeHref).toBeUndefined();
});
