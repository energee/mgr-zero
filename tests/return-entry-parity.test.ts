import { beforeEach, expect, it, vi } from "vitest";
const { query, permission } = vi.hoisted(() => ({ query: vi.fn(), permission: vi.fn() }));
vi.mock("@/lib/brewery", () => ({ getActiveBrewery: async () => ({ id: "brewery" }) }));
vi.mock("@/lib/commands/context", () => ({ buildContext: async () => ({ breweryId: "brewery" }) }));
vi.mock("@/lib/mgr/page-query", () => ({ runPageQuery: query, requirePagePermission: permission }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(href); } }));
import ReturnPage from "@/app/(app)/invoices/[id]/return/page";
import { CreditMemoForm, buildReturnLines } from "@/app/(app)/invoices/[id]/credit-memo-form";
import { toReturnCreditViewProps } from "@/lib/mgr/return-credit-view";

const params = Promise.resolve({ id: "invoice" });
const invoice = { id: "invoice", invoice_no: 35, kind: "invoice", shipment_id: "shipment" };
const line = { id: "line", kind: "sku", sku_id: "sku", keg_size: null, qty: 2, unit_price_cents: 101, description: "Actual line", skus: null };
const deposit = { ...line, id: "deposit", kind: "keg_deposit", sku_id: null, keg_size: "half_bbl", unit_price_cents: 3000, description: "Keg deposit" };
beforeEach(() => {
  query.mockReset(); permission.mockReset();
  query.mockImplementation(async name => name === "get_invoice" ? { invoice, lines: [line, deposit, { ...line, id: "adjustment", kind: "adjustment", sku_id: null }] } : []);
});

it("guards deep links before loading invoice, sources and bins", async () => {
  permission.mockImplementation(() => { throw new Error("denied"); });
  await expect(ReturnPage({ params })).rejects.toThrow("denied");
  expect(permission).toHaveBeenCalledWith({ breweryId: "brewery" }, "return_shipment");
  expect(query).not.toHaveBeenCalled();
});

it("binds invoice identities and captured prices without fabricated order data", async () => {
  const page = await ReturnPage({ params });
  expect(page.type).toBe(CreditMemoForm);
  expect(page.props.lines).toEqual([
    { id: "line", kind: "sku", skuId: "sku", label: "Actual line", qty: 2, unitPriceCents: 101 },
    { id: "deposit", kind: "keg_deposit", skuId: null, label: "Keg deposit · ½ bbl", qty: 2, unitPriceCents: 3000 },
  ]);
  expect(page.props.invoiceNo).toBe(35);
  expect(page.props.shipmentId).toBe("shipment");
});

it("refuses returning a credit memo", async () => {
  query.mockImplementation(async name => name === "get_invoice" ? { invoice: { ...invoice, kind: "credit_memo" }, lines: [] } : []);
  await expect(ReturnPage({ params })).rejects.toThrow("/invoices/invoice");
});

it("keeps explicit shipped movement IDs, and omits sources only for legacy invoices", () => {
  const rows = [{ id: "line", kind: "sku" as const, skuId: "sku", label: "Actual line", qty: 2 }];
  const sources = [{ id: "movement", sku_id: "sku", qty: -2, lot_id: null, lots: null, bins: null }];
  expect(buildReturnLines(rows, { line: "0.5" }, sources, { movement: "0.5" }, "bin", "shipment")).toEqual([
    { invoiceLineId: "line", qty: 0.5, sources: [{ movementId: "movement", binId: "bin", qty: 0.5 }] },
  ]);
  expect(buildReturnLines(rows, { line: "1" }, [], {}, "", null)).toEqual([{ invoiceLineId: "line", qty: 1 }]);
  expect(buildReturnLines(rows, { line: "1" }, [], {}, "", "shipment")[0].sources).toEqual([]);
  expect(buildReturnLines(rows, { line: "0" }, sources, {}, "bin", "shipment")).toEqual([]);
  const depositRow = { id: "deposit", kind: "keg_deposit" as const, skuId: null, label: "Keg deposit · ½ bbl", qty: 2 };
  expect(buildReturnLines([...rows, depositRow], { line: "0.5", deposit: "1" }, sources, { movement: "0.5" }, "bin", "shipment")).toEqual([
    { invoiceLineId: "line", qty: 0.5, sources: [{ movementId: "movement", binId: "bin", qty: 0.5 }] },
    { invoiceLineId: "deposit", qty: 1 },
  ]);
});

it("rounds credits at captured line prices and does not preselect a live reason", () => {
  const snapshot = { invoice: { invoice_no: 35 }, locations: [], lines: [{ id: "line", qty_shipped: 2, qty_returning: 0.5, unit_price_cents: 101, skus: null }] };
  expect(toReturnCreditViewProps({ ...snapshot, reason: "unsold" }).tape.at(-1)?.[1]).toBe("−$0.51");
  const blank = toReturnCreditViewProps({ ...snapshot, reason: "" });
  expect(blank.reason).toBe(-1); expect(blank.tape).toEqual([]);
});

it("round-trips every return reason through its chip index", () => {
  const snapshot = { invoice: { invoice_no: 35 }, locations: [], lines: [{ id: "line", qty_shipped: 2, qty_returning: 0.5, unit_price_cents: 101, skus: null }] };
  // credit-memo-form turns the chip index straight back into RETURN_REASONS[i].id,
  // so the selected reason must round-trip through the index for every value.
  // (order-sheets-view.test.ts owns the label wording.)
  expect(toReturnCreditViewProps({ ...snapshot, reason: "damaged" }).reason).toBe(0);
  expect(toReturnCreditViewProps({ ...snapshot, reason: "wrong_item" }).reason).toBe(1);
  expect(toReturnCreditViewProps({ ...snapshot, reason: "unsold" }).reason).toBe(2);
});
