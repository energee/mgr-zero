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
const line = { id: "line", sku_id: "sku", qty: 2, unit_price_cents: 101, description: "Actual line", skus: null };
beforeEach(() => {
  query.mockReset(); permission.mockReset();
  query.mockImplementation(async name => name === "get_invoice" ? { invoice, lines: [line, { ...line, id: "deposit", sku_id: null }] } : []);
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
  expect(page.props.lines).toEqual([{ id: "line", skuId: "sku", label: "Actual line", qty: 2, unitPriceCents: 101 }]);
  expect(page.props.invoiceNo).toBe(35);
  expect(page.props.shipmentId).toBe("shipment");
});

it("refuses returning a credit memo", async () => {
  query.mockImplementation(async name => name === "get_invoice" ? { invoice: { ...invoice, kind: "credit_memo" }, lines: [] } : []);
  await expect(ReturnPage({ params })).rejects.toThrow("/invoices/invoice");
});

it("keeps explicit shipped movement IDs, and omits sources only for legacy invoices", () => {
  const rows = [{ id: "line", skuId: "sku", label: "Actual line", qty: 2 }];
  const sources = [{ id: "movement", sku_id: "sku", qty: -2, lot_id: null, lots: null, bins: null }];
  expect(buildReturnLines(rows, { line: "0.5" }, sources, { movement: "0.5" }, "bin", "shipment")).toEqual([
    { invoiceLineId: "line", qty: 0.5, sources: [{ movementId: "movement", binId: "bin", qty: 0.5 }] },
  ]);
  expect(buildReturnLines(rows, { line: "1" }, [], {}, "", null)).toEqual([{ invoiceLineId: "line", qty: 1 }]);
  expect(buildReturnLines(rows, { line: "1" }, [], {}, "", "shipment")[0].sources).toEqual([]);
  expect(buildReturnLines(rows, { line: "0" }, sources, {}, "bin", "shipment")).toEqual([]);
});

it("rounds credits at captured line prices and does not preselect a live reason", () => {
  const snapshot = { invoice: { invoice_no: 35 }, locations: [], lines: [{ id: "line", qty_shipped: 2, qty_returning: 0.5, unit_price_cents: 101, skus: null }] };
  expect(toReturnCreditViewProps({ ...snapshot, reason: "unsold" }).tape.at(-1)?.[1]).toBe("−$0.51");
  const blank = toReturnCreditViewProps({ ...snapshot, reason: "" });
  expect(blank.reason).toBe(-1); expect(blank.tape).toEqual([]);
});
