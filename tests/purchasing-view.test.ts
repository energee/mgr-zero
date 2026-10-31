// tests/purchasing-view.test.ts — PO, materials, and vendor adapters plus
// HTML. Views own no sample data. Live NewPoForm / ReceiveForm / CountForm /
// MaterialForm / VendorForm / ContractForm stay wrappers.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { ContractView } from "../components/mgr/views/contract";
import { ContractsView } from "../components/mgr/views/contracts";
import { CycleCountView, CycleCountFooter } from "../components/mgr/views/cycle-count";
import { E, splitPinned } from "../components/mgr/e";
import { MaterialView } from "../components/mgr/views/material";
import { MaterialsOnHandView } from "../components/mgr/views/materials-on-hand";
import { NewPoView } from "../components/mgr/views/new-po";
import { PurchaseOrderRows, PurchaseOrdersView } from "../components/mgr/views/purchase-orders";
import { ReceiptView } from "../components/mgr/views/receipt";
import { ReceiptFixture } from "../components/mgr/fixture-adapters";
import { ReceivePoView } from "../components/mgr/views/receive-po";
import { VendorView } from "../components/mgr/views/vendor";
import { VendorsView } from "../components/mgr/views/vendors";
import { VendorDetailView } from "../components/mgr/views/vendor-detail";
import { toVendorDetailViewProps } from "../lib/mgr/vendor-detail-view";
import {
  contractEdit, contractsList, cycleCountCans, materialCitra, materialsOnHandList,
  correctReceiptPo, draftPoCanSource, editPoCanSource, newPoDraft, purchaseOrdersWarehouse, receiptPoPartial, receivePoSent, vendorDetail, vendorEdit, vendorsList,
} from "../lib/mgr/fixtures/purchasing";
import { contractRowView, toContractsViewProps } from "../lib/mgr/contracts-view";
import { toMaterialsOnHandViewProps, toMaterialsScopes } from "../lib/mgr/materials-on-hand-view";
import { poDetailStatus, poListStatus, purchaseOrderNext, toPurchaseOrdersViewProps } from "../lib/mgr/purchase-orders-view";
import { poLineDetail, poLineQty } from "../lib/mgr/receive-po-view";
import { receiptBillPresentation, receiptBillRequest, toPostedReceiptViewProps, type ReceiptSnapshot } from "../lib/mgr/receipt-view";
import { toVendorsViewProps } from "../lib/mgr/vendors-view";
import { contractSubmitReason } from "../lib/mgr/contract-view";
import { expectedFromLeadTime, newPoReason } from "../lib/mgr/new-po-view";
import { CLOSURE_FORM_ID, receiveReason } from "../lib/mgr/receive-po-view";
import { beginRecovery, discardRecovery } from "../lib/commands/recovery";

const htmlOf = (node: ReactNode) => renderToStaticMarkup(createElement("div", null, node));
const screen = (name: string) => SCREENS.find((s) => s.name === name)!;
const src = (file: string) => readFileSync(file, "utf8");

describe("Purchase orders", () => {
  it("Vendor, Material, Received into and Bin prompts are unavailable choices (#1388)", () => {
    const pick = vi.spyOn(E, "pick");
    htmlOf(createElement(NewPoView, { model: newPoDraft }));
    htmlOf(createElement(ReceivePoView, { model: receivePoSent }));
    const calls = [...pick.mock.calls];
    pick.mockRestore();
    for (const label of ["Vendor", "Material", "Received into", "Bin"]) {
      const options = calls.find(([name]) => name === label)?.[2];
      expect(options, label).toEqual(expect.arrayContaining([
        expect.objectContaining({ value: "", disabled: true }),
      ]));
    }
  });

  it("a closed order with no next action is a row link, not an Open verb (#996)", () => {
    const model = toPurchaseOrdersViewProps({ title: "Purchase orders", subtitle: "every order", rows: [
      { key: "po", title: "PO-0012 · Hop Co", detail: "received", href: "/purchase-orders/po" },
    ] });
    const markup = renderToStaticMarkup(createElement(PurchaseOrdersView, { model, linkRows: true, createAction: null }));
    expect(markup).toContain('href="/purchase-orders/po"');
    expect(markup).toContain('aria-label="Open"');
    expect(markup).not.toMatch(/>Open</);
  });

  // #1586: the vendor page draws its open orders with the list's own rows.
  it("PurchaseOrderRows draws a draft's Mark sent act, a received order as a plain nav, and links on request", () => {
    const rows = [
      { key: "draft", title: "PO-0001 · Hop Co", detail: "Draft", verb: "Mark sent", tone: "info" as const, href: "/purchase-orders/draft" },
      { key: "done", title: "PO-0002 · Hop Co", detail: "Received", href: "/purchase-orders/done" },
    ];
    const inert = htmlOf(createElement(PurchaseOrderRows, { rows }));
    expect(inert).toMatch(/>Mark sent</);
    expect(inert).toContain("PO-0002 · Hop Co");
    expect(inert).not.toContain("href=");
    const linked = htmlOf(createElement(PurchaseOrderRows, { rows, linkRows: true }));
    expect(linked).toContain('href="/purchase-orders/draft"');
    expect(linked).toContain('href="/purchase-orders/done"');
  });

  it("each order status names its next action; received and cancelled have none (#996)", () => {
    expect(purchaseOrderNext("draft")).toEqual({ verb: "Mark sent", tone: "info" });
    expect(purchaseOrderNext("sent")).toEqual({ verb: "Receive", tone: "info" });
    expect(purchaseOrderNext("partially_received")).toEqual({ verb: "Receive", tone: "attention" });
    expect(purchaseOrderNext("received")).toBeUndefined();
    expect(purchaseOrderNext("cancelled")).toBeUndefined();
  });

  it("list and detail read status in sentence case and name a short closure (#1501)", () => {
    const po = { status: "received", closed_at: null, close_reason: null, ordered_on: "2026-09-07", expected_on: "2026-09-10", sent_via: "mailto", lines_open: 0 };
    expect(poListStatus({ ...po, status: "draft", ordered_on: null })).toBe("Draft");
    expect(poListStatus(po)).toBe("Received");
    expect(poListStatus({ ...po, status: "sent" })).toBe("Sent Sep 7, 2026 · expected Sep 10, 2026");
    expect(poListStatus({ ...po, status: "partially_received", lines_open: 1 })).toBe("Partially received · 1 line still due");
    expect(poListStatus({ ...po, closed_at: "2026-09-12T00:00:00Z" })).toBe("Closed short");
    expect(poListStatus({ ...po, status: "cancelled", closed_at: "2026-09-12T00:00:00Z" })).toBe("Cancelled");
    expect(poDetailStatus({ ...po, closed_at: "2026-09-12T00:00:00Z", close_reason: "QA test close" })).toBe("Closed short · QA test close");
    expect(poDetailStatus({ ...po, status: "draft", ordered_on: null, sent_via: null })).toBe("Draft · not yet sent");
    expect(poDetailStatus(po)).toBe("Marked sent Sep 7, 2026 · from a mail client · expected Sep 10, 2026 · received");
  });

  it("a PO line puts its purchase unit on every quantity (#1501)", () => {
    const line = { qty_ordered: 10, qty_received: 8, qty_open: 0, expected_lot_code: null, material: { purchase_uom: "lb" } };
    expect(poLineDetail(line)).toBe("ordered 10 lb · received 8 lb · still due 0 lb");
    expect(poLineDetail({ ...line, expected_lot_code: "L-1" })).toBe("ordered 10 lb · received 8 lb · still due 0 lb · PO lot L-1");
    expect(poLineQty(10, line.material)).toBe("10 lb");
    expect(poLineQty(10, null)).toBe("10");
  });

  it("a vendor's observed lead time reads as orders and how they were sent (#1501)", () => {
    const vendor = { key: "v", name: "Hop Co", active: true, lead_time_days: null, contracts: [], observed: [
      { sent_via: "mailto", n: 2, avg_lead_days: 0 },
      { sent_via: "external", n: 1, avg_lead_days: 3.5 },
    ] };
    expect(toVendorsViewProps({ rows: [vendor] }).rows[0]).toEqual({
      key: "v", name: "Hop Co", status: "Active", leadTime: "Not typed", contracts: 0, href: "/vendors/v",
      observed: "0 days over 2 orders sent from a mail client · 3.5 days over 1 order sent outside MGR",
    });
    const typed = toVendorsViewProps({ rows: [{ ...vendor, active: false, lead_time_days: 1, observed: [], contracts: [{}] }] }).rows[0];
    expect(typed).toMatchObject({ status: "Inactive", leadTime: "1 day", observed: null, contracts: 1 });
  });

  it("the Purchase orders inventory record is PurchaseOrdersView", () => {
    const body = screen("Purchase orders").body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(screen("Purchase orders").body)).toBe(true);
    expect(body.type).toBe(PurchaseOrdersView);
    expect(body.props.model).toEqual(toPurchaseOrdersViewProps(purchaseOrdersWarehouse));
  });

  it("the live POs list links to a full-page shared New PO form", () => {
    const page = src("app/(app)/purchase-orders/page.tsx");
    expect(page).toMatch(/<PurchaseOrdersView\b/);
    expect(page).toContain('"/purchase-orders/new"');
    expect(page).not.toMatch(/<NewPoForm\b|list=\{/);
    const form = src("app/(app)/purchase-orders/new-po-form.tsx");
    expect(form).toMatch(/<NewPoView\b/);
    expect(form).not.toMatch(/<CommandForm\b/);
  });

  it("the New PO inventory record is NewPoView", () => {
    const body = screen("New PO").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(NewPoView);
    expect(body.props.model).toEqual(newPoDraft);
  });

  it("shares decimal counts, untracked lot omission, errors and disabled saving", () => {
    const pick = vi.spyOn(E, "pick");
    const html = htmlOf(createElement(NewPoView, {
      model: { vendor: "vendor-id", vendors: [{ id: "vendor-id", name: "Actual vendor" }], expected: "", lines: [
        { key: "line", title: "Actual material", detail: "each", qty: "1.5", cost: "" },
      ] }, submitting: true, messages: "Request failed",
    }));
    // Radix mounts option DOM after hydration; assert the shared pick's identity contract.
    expect(pick).toHaveBeenCalledWith("Vendor", "vendor-id", expect.arrayContaining([{ value: "vendor-id", label: "Actual vendor" }]), expect.anything());
    pick.mockRestore();
    expect(html).toContain('value="1.5"');
    expect(html).toContain('step="any"');
    expect(html).toContain("Request failed");
    expect(html).toContain("Saving…");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Expected lot");
    expect(html).not.toContain('href="/purchase-orders"');
    expect(htmlOf(createElement(NewPoView, { model: newPoDraft, footer: null }))).not.toContain("Save draft");
    const page = src("app/(app)/purchase-orders/new/page.tsx");
    expect(page.indexOf('requirePagePermission(ctx, "create_purchase_order"')).toBeLessThan(page.indexOf('runPageQuery("list_vendors_and_contracts"'));
  });

  it("the Receive PO inventory record is ReceivePoView", () => {
    const body = screen("Receive PO").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(ReceivePoView);
    expect(body.props.model).toEqual(receivePoSent);
  });

  it("receiving and correction show editable actual unit costs and refuse invalid costs", () => {
    for (const model of [receivePoSent, correctReceiptPo]) {
      const html = htmlOf(createElement(ReceivePoView, { model }));
      expect(html).toContain('aria-label="2-row · 55 lb bags unit cost"');
      expect(html).toContain('value="28.50"');
      for (const cost of ["-1", "21474836.48", "1e3", "not a price"]) {
        expect(receiveReason({ ...model, lines: [{ key: "line", title: "Malt", detail: "", qty: 1, cost }] })).toContain("unit cost");
      }
      for (const cost of ["", "0", "12.34"]) {
        expect(receiveReason({ ...model, closure: undefined, lines: [{ key: "line", title: "Malt", detail: "", qty: 1, cost }] })).toBeNull();
      }
    }
  });

  it("omits a blank-count line's invalid cost when receiving but requires it on correction", () => {
    const lines = [
      { key: "included", title: "Malt", detail: "", qty: "1", cost: "12.34" },
      { key: "omitted", title: "Hops", detail: "", qty: "", cost: "-1" },
    ];
    expect(receiveReason({ ...receivePoSent, lines })).toBeNull();
    const correcting = receiveReason({ ...correctReceiptPo, lines });
    expect(correcting).toContain("a count for Hops");
    expect(correcting).toContain("a unit cost");
    expect(receiveReason({ ...receivePoSent, lines: lines.map(line => ({ ...line, qty: "1" })) })).toContain("a unit cost");
  });

  it("submits closure through its own form, so Enter in the reason never submits the receipt or send form", () => {
    const html = htmlOf(createElement(ReceivePoView, { model: receivePoSent }));
    expect(html).toMatch(new RegExp(`<input[^>]*aria-label="Closure reason"[^>]*form="${CLOSURE_FORM_ID}"|<input[^>]*form="${CLOSURE_FORM_ID}"[^>]*aria-label="Closure reason"`));
    expect(html).toMatch(new RegExp(`<button[^>]*type="submit"[^>]*form="${CLOSURE_FORM_ID}"|<button[^>]*form="${CLOSURE_FORM_ID}"[^>]*type="submit"`));
  });

  it("renders reason-bearing closure controls on the shared receive view", () => {
    const cancel = htmlOf(createElement(ReceivePoView, { model: receivePoSent }));
    expect(cancel).toContain("Cancel purchase order");
    expect(cancel).toContain("Closure reason");
    const short = htmlOf(createElement(ReceivePoView, { model: { ...receivePoSent, state: "partially_received", closure: "short" } }));
    expect(short).toContain("Close short");
    expect(short).not.toContain("Cancel purchase order");
    const closed = htmlOf(createElement(ReceivePoView, { model: { title: "Closed PO", state: "received", status: "closed short · Vendor cancelled remainder" } }));
    expect(closed).toContain("Vendor cancelled remainder");
    expect(closed).not.toContain("Close short");
    expect(closed).not.toContain("Receive purchase order");
  });

  it("Receive purchase order and Correct receipt name what they wait for (#1485)", () => {
    const lines = receivePoSent.lines!;
    const receive = (patch: Partial<typeof receivePoSent>) => receiveReason({ ...receivePoSent, ...patch });
    expect(receive({})).toBeNull();
    // One -1 line among valid lines is named, never dropped from the receipt.
    expect(receive({ lines: lines.map(line => line.key === "hulls" ? { ...line, qty: "-1" } : line) })).toBe("Still needed: a count of zero or more for Rice hulls · 50 lb.");
    expect(receive({ lines: lines.map(line => line.key === "hulls" ? { ...line, qty: "1e3" } : line) })).toBe("Still needed: a count of zero or more for Rice hulls · 50 lb.");
    // A blank line is left out of a new receipt; an all-blank receipt counts nothing.
    expect(receive({ lines: lines.map(line => line.key === "hulls" ? { ...line, qty: "" } : line) })).toBeNull();
    expect(receive({ lines: lines.map(line => ({ ...line, qty: "" })) })).toBe("Still needed: a count above zero on at least one line.");
    // A 0 is a short line beside a received one; a receipt of only zeros records nothing (#1485).
    expect(receive({ lines: lines.map(line => line.key === "hulls" ? line : { ...line, qty: "0" }) })).toBeNull();
    expect(receive({ lines: lines.map(line => ({ ...line, qty: line.key === "hulls" ? "0" : "" })) })).toBe("Still needed: a count above zero on at least one line.");
    expect(receive({ lines: lines.map(line => ({ ...line, qty: "0" })) })).toBe("Still needed: a count above zero on at least one line.");
    expect(receive({ locationId: "", binId: "", receivedOn: "", lines: lines.map(line => line.key === "malt" ? { ...line, lot: " " } : line) }))
      .toBe("Still needed: a location, a bin, a received day, and a lot code for 2-row · 55 lb bags.");
    // A lot-tracked line counted 0 needs no lot.
    expect(receive({ lines: lines.map(line => line.key === "malt" ? { ...line, qty: "0", lot: "" } : line) })).toBeNull();
    const correct = (patch: Partial<typeof correctReceiptPo>) => receiveReason({ ...correctReceiptPo, ...patch });
    expect(correct({})).toBeNull();
    expect(correct({ correctionReason: " ", lines: correctReceiptPo.lines!.map(line => line.key === "hulls" ? { ...line, qty: "" } : line) }))
      .toBe("Still needed: a correction reason and a count for Rice hulls · 50 lb.");
    expect(receiveReason({ ...receivePoSent, state: "draft" })).toBeNull();
  });

  it("prints Receive's reason beside its own button, apart from the closure reason (#1485)", () => {
    const html = htmlOf(createElement(ReceivePoView, { model: { ...receivePoSent, locationId: "" } }));
    const button = html.match(/<button[^>]*>Receive purchase order<\/button>/)?.[0];
    expect(button).toContain('disabled=""');
    const id = button?.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(html).toMatch(new RegExp(`<p id="${id}"[^>]*>Still needed: a location\\.</p>`));
  });

  it("renders Receive purchase order without leaking live hrefs", () => {
    expect(htmlOf(createElement(ReceivePoView, { model: receivePoSent }))).toMatch(/>Receive purchase order</);
    expect(htmlOf(createElement(ReceivePoView, { model: receivePoSent }))).not.toMatch(/href="\/purchase-orders"/);
  });

  it("draft receiving keeps counts read-only and only offers the send attestation", () => {
    const html = htmlOf(createElement(ReceivePoView, { model: { ...receivePoSent, state: "draft" } }));
    expect(html).toContain("Mark sent");
    expect(html).toContain("nothing is emailed");
    expect(html).not.toContain("Receive purchase order");
    expect(html).not.toContain('type="number"');
    const receiving = htmlOf(createElement(ReceivePoView, { model: { title: "Actual PO", lines: [{ key: "line-id", title: "Actual material", detail: "expected 4", qty: "5.5", lot: "" }], lotSuggestionsUnavailable: true } }));
    expect(receiving).toContain('value="5.5"');
    expect(receiving).toContain("Lot code off the package");
    expect(receiving).toContain("Best by");
    expect(receiving).toContain("Recent lots");
    expect(receiving).not.toContain('max="4"');
  });

  it("#1584 picking a vendor prefills Expected with today plus its lead time, or blank without one", () => {
    expect(expectedFromLeadTime("2026-10-28", 7)).toBe("2026-11-04");
    expect(expectedFromLeadTime("2026-12-30", 3)).toBe("2027-01-02");
    expect(expectedFromLeadTime("2026-10-28", 0)).toBe("2026-10-28");
    expect(expectedFromLeadTime("2026-10-28", null)).toBe("");
    const form = src("app/(app)/purchase-orders/new-po-form.tsx");
    expect(form).toMatch(/expectedFromLeadTime\(today, vendors\.find/);
  });

  it("#1584 a draft puts Mark sent before Cancel, which folds behind a disclosure", () => {
    expect(screen("Draft PO").body).toEqual(createElement(ReceivePoView, { model: draftPoCanSource }));
    const html = htmlOf(createElement(ReceivePoView, { model: draftPoCanSource }));
    expect(html.indexOf(">Mark sent<")).toBeGreaterThan(-1);
    expect(html.indexOf(">Mark sent<")).toBeLessThan(html.indexOf("Closure reason"));
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Cancel purchase order<\/summary>/);
    expect(html).not.toMatch(/<details[^>]*open/);
    // Close short folds the same way after the receive verb.
    const short = htmlOf(createElement(ReceivePoView, { model: { ...receivePoSent, state: "partially_received", closure: "short" } }));
    expect(short.indexOf(">Receive purchase order<")).toBeLessThan(short.indexOf("Closure reason"));
    expect(short).toMatch(/<summary[^>]*>Close remaining quantity<\/summary>/);
  });

  it("#1584 a draft links Edit draft to the shared New PO form; the inventory link stays inert", () => {
    expect(htmlOf(createElement(ReceivePoView, { model: draftPoCanSource }))).toMatch(/<a[^>]*href="#"[^>]*>Edit draft<\/a>/);
    expect(htmlOf(createElement(ReceivePoView, { model: receivePoSent }))).not.toContain("Edit draft");
    expect(screen("Edit PO").body).toEqual(createElement(NewPoView, { model: editPoCanSource }));
    const html = htmlOf(createElement(NewPoView, { model: editPoCanSource }));
    expect(html).toContain(">Edit PO-0143<");
    expect(html).toContain("Save draft");
    const page = src("app/(app)/purchase-orders/[id]/edit/page.tsx");
    expect(page.indexOf('requirePagePermission(ctx, "update_purchase_order"')).toBeLessThan(page.indexOf('runPageQuery("get_purchase_order"'));
    expect(page).toContain("<NewPoForm");
    expect(src("app/(app)/purchase-orders/new-po-form.tsx")).toMatch(/"update_purchase_order"/);
    expect(src("app/(app)/purchase-orders/[id]/page.tsx")).toMatch(/editHref: `\/purchase-orders\/\$\{po\.id\}\/edit`/);
  });

  it("the Receipt inventory adapter mounts the same ReceiptView as the live route", () => {
    const body = screen("Receipt").body as { type: unknown; props: { children: { type: unknown; props: { model: unknown } } } };
    expect(body.type).toBe(ReceiptFixture);
    expect(body.props.children.type).toBe(ReceiptView);
    expect(body.props.children.props.model).toEqual(receiptPoPartial);
  });

});

it("posted receipt uses counted quantities, captured lot references and current balances", () => {
  const snapshot = {
    id: "po-id", po_no: 42, status: "partially_received",
    lines: [{ id: "line-id", qty_open: 1, material: { name: "Actual material", purchase_uom: "box", purchase_uom_factor: 10, base_uom: "kg" } }],
    receipts: [{ id: "receipt-id", received_on: "2026-09-12", receipt_lines: [{ po_line_id: "line-id", qty_counted: 3, variance: -1, lot_id: "actual-lot-id", material_name: "Actual material", purchase_uom: "box", purchase_uom_factor: 10, base_uom: "kg" }] }],
  };
  const model = toPostedReceiptViewProps(snapshot, "receipt-id")!;
  expect(model.title).toContain("PO-0042");
  expect(model.title).toContain("Sep 12, 2026");
  expect(model.status).toBe("partially received");
  expect(model.stillOwed).toBe("1 box Actual material");
  expect(model.tape[0][0]).toBe("+30 kg Actual material · receipt");
  expect(model.tape[0][1]).toContain("short 1 box");
  expect(model.tape[0][1]).toContain("actual-lot-id");
  expect(model.backHref).toBeUndefined();
  expect(model.backTo).toBe("PO-0042");
  expect(toPostedReceiptViewProps(snapshot, "wrong-receipt")).toBeUndefined();
  expect(toPostedReceiptViewProps({ ...snapshot, lines: [{ ...snapshot.lines[0], qty_open: 0 }] }, "receipt-id")!.stillOwed).toBe("Nothing owed");
});

it("posted receipt converts sacks to pounds exactly, without float error", () => {
  const sack = { material_name: "Pale malt", purchase_uom: "sack", base_uom: "lb", variance: 0 };
  const snapshot = {
    id: "po-id", po_no: 7, status: "received", lines: [],
    receipts: [{ id: "receipt-id", received_on: "2026-09-12", receipt_lines: [
      { ...sack, po_line_id: "a", qty_counted: 2, purchase_uom_factor: 55 },
      { ...sack, po_line_id: "b", qty_counted: 4.4, purchase_uom_factor: 50 },
    ] }],
  };
  const tape = toPostedReceiptViewProps(snapshot, "receipt-id")!.tape;
  expect(tape[0][0]).toBe("+110 lb Pale malt · receipt");
  expect(tape[1][0]).toBe("+220 lb Pale malt · receipt");
});

describe("receipt Bill presentation", () => {
  const receipt: ReceiptSnapshot = { id: "latest", received_on: "2026-09-20", receipt_lines: [], corrects_receipt_id: "original" };
  const admin = { canPost: true, connected: true, mappingsReady: true, mappingHref: "/settings/accounting/mappings" };

  it("offers first posting only to an admin with current mappings on the effective receipt", () => {
    expect(receiptBillPresentation(receipt, admin).action).toBe("post");
    expect(receiptBillPresentation(receipt, { ...admin, canPost: false }).action).toBeUndefined();
    expect(receiptBillPresentation(receipt, { ...admin, connected: false }).connectionRequired).toBe(true);
    expect(receiptBillPresentation(receipt, { ...admin, connected: false }).action).toBeUndefined();
    expect(receiptBillPresentation(receipt, { ...admin, mappingsReady: false }).mappingHref).toBe(admin.mappingHref);
    expect(receiptBillPresentation(receipt, { ...admin, mappingsReady: false }).action).toBeUndefined();
    expect(receiptBillPresentation({ ...receipt, corrected_by_receipt_id: "newer" }, admin).action).toBeUndefined();
  });

  it("reconciles unknown Bills by the frozen canonical receipt even after corrections or mapping changes", () => {
    const bill = receiptBillPresentation({ ...receipt, qbo_bill_status: "pending", qbo_bill_receipt_id: "original", qbo_bill_request_id: "provider-request" }, { ...admin, mappingsReady: false });
    expect(bill).toMatchObject({ status: "pending", receiptId: "original", requestId: "provider-request", action: "retry" });
    expect(bill.mappingHref).toBeUndefined();
    const html = htmlOf(createElement(ReceiptView, { model: { ...receiptPoPartial, bill }, onPostBill: async () => true }));
    expect(html).toContain("Posting result unknown");
    expect(html).toContain("Retry exact Bill");
    expect(html).toContain("original provider request ID");
    expect(html).toContain('data-preview-action="true"');
  });

  it("makes a rejected Bill an explicit corrected attempt against the latest receipt, not an unknown retry", () => {
    const rejected = { ...receipt, qbo_bill_status: "push_failed" as const, qbo_bill_receipt_id: "original", qbo_bill_request_id: "rejected-request", qbo_bill_error: "Account rejected" };
    const bill = receiptBillPresentation(rejected, admin);
    expect(bill).toMatchObject({ status: "push_failed", receiptId: "latest", action: "corrected", mappingHref: admin.mappingHref });
    expect(receiptBillPresentation({ ...rejected, corrected_by_receipt_id: "newer" }, admin).action).toBeUndefined();
    const html = htmlOf(createElement(ReceiptView, { model: { ...receiptPoPartial, bill }, onPostBill: async () => true }));
    expect(html).toContain("Rejected by QuickBooks");
    expect(html).toContain("Post corrected Bill");
    expect(html).toContain('href="/settings/accounting/mappings"');
    expect(html).toContain("Account rejected");
  });

  it("recovers the exact corrected command after refreshed server state becomes pending", () => {
    const values: Record<string, string> = {};
    const storage = { getItem: (key: string) => values[key] ?? null, setItem: (key: string, value: string) => { values[key] = value; }, removeItem: (key: string) => { delete values[key]; } };
    const context = { actorId: "operator", breweryId: "brewery" };
    const target = "receipt-bill:latest";
    const corrected = receiptBillRequest({ receiptId: "latest", status: "push_failed", action: "corrected" });
    const original = beginRecovery(storage, context, "/purchase-orders/po", "post_receipt_bill", corrected.input, { target });
    const retry = receiptBillRequest({ receiptId: "latest", status: "pending", action: "retry" }, original.attempt);
    expect(retry).toEqual({ input: { receiptId: "latest", newAttemptReason: "corrected" }, requestId: original.attempt.requestId, discardRequestId: undefined });
    expect(beginRecovery(storage, context, "/purchase-orders/po", "post_receipt_bill", retry.input, { target, requestId: retry.requestId }))
      .toEqual({ attempt: original.attempt, resumed: true });
  });

  it("retires a lost rejection response only when the operator confirms a corrected attempt", () => {
    const values: Record<string, string> = {};
    const storage = { getItem: (key: string) => values[key] ?? null, setItem: (key: string, value: string) => { values[key] = value; }, removeItem: (key: string) => { delete values[key]; } };
    const context = { actorId: "operator", breweryId: "brewery" };
    const target = "receipt-bill:latest";
    const previous = beginRecovery(storage, context, "/purchase-orders/po", "post_receipt_bill", { receiptId: "latest" }, { target });
    const corrected = receiptBillRequest({ receiptId: "latest", status: "push_failed", action: "corrected" }, previous.attempt);
    expect(corrected.discardRequestId).toBe(previous.attempt.requestId);
    expect(discardRecovery(storage, context, corrected.discardRequestId!)).toBe(true);
    const next = beginRecovery(storage, context, "/purchase-orders/po", "post_receipt_bill", corrected.input, { target });
    expect(next.resumed).toBe(false);
    expect(next.attempt.requestId).not.toBe(previous.attempt.requestId);
    expect(next.attempt.input).toEqual({ receiptId: "latest", newAttemptReason: "corrected" });
  });

  it("keeps a posted correction chain immutable in MGR and states QuickBooks-only payments", () => {
    const bill = receiptBillPresentation({ ...receipt, qbo_bill_status: "pushed", qbo_bill_id: "731", qbo_bill_receipt_id: "original" }, admin);
    expect(bill.action).toBeUndefined();
    expect(bill.receiptId).toBe("original");
    const html = htmlOf(createElement(ReceiptView, { model: { ...receiptPoPartial, bill } }));
    expect(html).toContain("Bill posted, adjust in QuickBooks");
    expect(html).toContain("Bill payments are managed only in QuickBooks");
    expect(html).not.toContain("Post Bill to QuickBooks");
    expect(html).toContain("Correct receipt");
  });
});

describe("Materials", () => {
  it("the Materials on hand inventory record is MaterialsOnHandView", () => {
    const body = screen("Materials on hand").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(MaterialsOnHandView);
    expect(body.props.model).toEqual(toMaterialsOnHandViewProps(materialsOnHandList));
  });

  it("the Cycle count inventory shares the complete view including its footer", () => {
    const { rest, pin } = splitPinned(screen("Cycle count").body);
    expect((rest[0] as { props: { model: unknown } }).props.model).toEqual(cycleCountCans);
    expect(htmlOf(rest)).toContain("Cans · 16 oz");
    expect(htmlOf(rest)).not.toContain("Record count");
    expect(htmlOf(pin)).toBe(htmlOf(E.pin(createElement(CycleCountFooter))));
    expect(src("app/(app)/materials/count-form.tsx")).toContain("footer={E.pin(<CycleCountFooter");
  });

  // #1165: the definitions list was the same rows with Edit for Count, so each row now offers both.
  it("each Materials on hand row offers Edit beside Count, and no definitions list remains", () => {
    const html = htmlOf(createElement(MaterialsOnHandView, { model: toMaterialsOnHandViewProps(materialsOnHandList) }));
    // RecordTable draws each record twice: the desk table and the phone list.
    expect(html.match(/>Edit</g)).toHaveLength(materialsOnHandList.rows!.length * 2);
    expect(html.match(/>Edit<[\s\S]*?>Count</g)).toHaveLength(materialsOnHandList.rows!.length * 2);
    expect(html).not.toContain("Material definitions");
    expect(SCREENS.find((s) => s.name === "Materials")).toBeUndefined();
    expect(src("app/(app)/materials/page.tsx")).not.toMatch(/definitions/);
  });

  // #1516 item 8: the shared RecordTable, its facts split into columns.
  it("draws materials through RecordTable: type, on hand, lots and status", () => {
    const model = toMaterialsOnHandViewProps({ rows: [
      { key: "citra", name: "Citra", category: "hop", unit: "lb", onHand: 1262.5, lotTracked: true, active: true },
      { key: "salt", name: "Gypsum", category: "chemical", unit: "g", onHand: 0, lotTracked: false, active: false },
    ] });
    expect(model.rows).toEqual([
      { key: "citra", name: "Citra", type: "Hop", onHand: "1,262.5 lb", onHandQty: 1262.5, lots: "Tracked", status: "Active" },
      { key: "salt", name: "Gypsum", type: "Chemical", onHand: "0 g", onHandQty: 0, lots: null, status: "Inactive" },
    ]);
    const html = htmlOf(createElement(MaterialsOnHandView, { model }));
    expect(html).toContain("<table");
    for (const header of ["Material", "Type", "On hand", "Lots", "Status"]) expect(html).toContain(`>${header}<`);
    expect(html).toContain(">1,262.5 lb<");
    // No material page exists, so the name is plain text, not a tap.
    expect(html).not.toMatch(/data-tap[^>]*>Citra</);
  });

  it("the live page slots MaterialForm and CountForm into each row", () => {
    const edit = vi.fn(() => "live edit");
    const count = vi.fn(() => "live count");
    const model = toMaterialsOnHandViewProps(materialsOnHandList);
    const html = htmlOf(createElement(MaterialsOnHandView, { model, rowEdit: edit, rowCount: count }));
    expect(edit).toHaveBeenCalledTimes(model.rows.length);
    expect(count).toHaveBeenCalledTimes(model.rows.length);
    expect(html).not.toMatch(/>Edit<|>Count</);
    expect(src("app/(app)/materials/page.tsx")).toMatch(/rowEdit=\{[\s\S]*<MaterialForm material=/);
    expect(src("app/(app)/materials/page.tsx")).toMatch(/rowCount=\{[\s\S]*<CountForm\b/);
  });

  it("count keeps real bin identities, decimal input, explicit preview and nullable footer", () => {
    const pick = vi.spyOn(E, "pick");
    const html = htmlOf(createElement(CycleCountView, {
      model: { lines: [{ key: "m", material: "Actual material", qty: "0.5", units: ["kg"], unitIndex: 0, preview: "system 2 · variance −1.5" }], locationId: "loc-id", binId: "bin-id", locations: [{ id: "loc-id", name: "Actual location" }], bins: [{ id: "bin-id", name: "Actual bin" }] },
      submitting: true, messages: "Count failed", footer: null,
    }));
    expect(pick).toHaveBeenCalledWith("Bin", "bin-id", expect.arrayContaining([{ value: "bin-id", label: "Actual bin" }]), expect.anything());
    pick.mockRestore();
    expect(html).toContain('value="0.5"');
    expect(html).toContain('step="any"');
    expect(html).toContain("Count failed");
    expect(html).toContain("Preview count");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Record count");
    expect(html).not.toContain("L-0774");
  });

  it("the material inventory records share MaterialView for create and edit", () => {
    const edit = screen("Edit material").body;
    const create = screen("Add material").body;
    expect(isValidElement(edit) && edit.type).toBe(MaterialView);
    if (!isValidElement<{ model: typeof materialCitra }>(create)) throw new Error("Add material must mount MaterialView");
    expect(create.type).toBe(MaterialView);
    expect(create.props.model).toMatchObject({ name: "", kind: "", baseUnits: "1", purchaseUnit: "lb", unit: "lb", lotTracked: false });
    const html = htmlOf(createElement(MaterialView, { model: materialCitra }));
    expect(html).toMatch(/>Save material</);
    expect(html).toMatch(/Default vendor/);
  });

  // #1112: each unit field says what it holds, and the help is a brewer's example, not schema talk.
  it("MaterialView names each unit field and explains them in plain words", () => {
    const pick = vi.spyOn(E, "pick");
    const edit = vi.spyOn(E, "edit");
    const html = htmlOf(createElement(MaterialView, { model: materialCitra }));
    expect(pick).toHaveBeenCalledWith("Base unit", "lb", expect.anything(), expect.anything());
    expect(pick).toHaveBeenCalledWith("Purchase unit", "each", expect.anything(), expect.anything());
    expect(edit).toHaveBeenCalledWith("Base units per purchase unit", "44", "number", undefined, expect.anything());
    pick.mockRestore();
    edit.mockRestore();
    expect(html).toContain("For hops bought in 44 lb boxes, set Base unit to lb, Purchase unit to each, and Base units per purchase unit to 44.");
    expect(html).not.toMatch(/schema/i);
  });

  it("offers a Kind placeholder and readable options without changing stored values", () => {
    const pick = vi.spyOn(E, "pick");
    try {
      const units = ["lb", "kg", "oz", "g", "each", "l", "gal", "ml"];
      const html = htmlOf(createElement(MaterialView, {
        model: { ...materialCitra, kind: "", kindOptions: ["malt", "hop", "yeast", "adjunct", "chemical", "packaging", "other"], unitOptions: units, purchaseUnitOptions: units },
      }));
      expect(html).toContain("Select kind");
      expect(pick).toHaveBeenCalledWith("Kind", "", [
        { value: "malt", label: "Malt" }, { value: "hop", label: "Hop" },
        { value: "yeast", label: "Yeast" }, { value: "adjunct", label: "Adjunct" },
        { value: "chemical", label: "Chemical" }, { value: "packaging", label: "Packaging" },
        { value: "other", label: "Other" },
      ], expect.objectContaining({ placeholder: "Select kind" }));
      const options = [
        { value: "lb", label: "Pounds (lb)" }, { value: "kg", label: "Kilograms (kg)" },
        { value: "oz", label: "Ounces (oz)" }, { value: "g", label: "Grams (g)" },
        { value: "each", label: "Each" }, { value: "l", label: "Liters (L)" },
        { value: "gal", label: "Gallons (gal)" }, { value: "ml", label: "Milliliters (mL)" },
      ];
      expect(pick).toHaveBeenCalledWith("Base unit", "lb", options, expect.anything());
      expect(pick).toHaveBeenCalledWith("Purchase unit", "each", options, expect.anything());
    } finally {
      pick.mockRestore();
    }
  });

  it("#1516 offers a Type pick, All types first, each type linking live and inert in the inventory", () => {
    const [type] = toMaterialsScopes({ category: "hop", href: patch => `/materials?category=${patch.category}` });
    expect(type).toMatchObject({ label: "Type", value: "hop" });
    expect(type!.options.slice(0, 3)).toEqual([
      { value: "", label: "All types", href: "/materials?category=" },
      { value: "malt", label: "Malt", href: "/materials?category=malt" },
      { value: "hop", label: "Hop", href: "/materials?category=hop" },
    ]);
    expect(toMaterialsScopes({ category: "" })[0]!.options.every(option => option.href === undefined)).toBe(true);
    expect(toMaterialsOnHandViewProps({ rows: [], filtered: true }).empty?.description).toBe("Clear the search or choose All types to see every material.");
  });

  it("links the unfiltered empty list to Purchase orders and keeps inventory links inert", () => {
    const model = toMaterialsOnHandViewProps({ rows: [], purchaseOrdersHref: "/purchase-orders" });
    const html = htmlOf(createElement(MaterialsOnHandView, { model }));
    expect(html).toMatch(/href="\/purchase-orders"[^>]*>Purchase orders</);
    const inventory = htmlOf(createElement(MaterialsOnHandView, { model: toMaterialsOnHandViewProps({ rows: [] }) }));
    expect(inventory).toMatch(/href="#"[^>]*>Purchase orders</);
    const filtered = htmlOf(createElement(MaterialsOnHandView, { model: toMaterialsOnHandViewProps({ rows: [], filtered: true, purchaseOrdersHref: "/purchase-orders" }) }));
    expect(filtered).not.toContain("Purchase orders");
    const populated = htmlOf(createElement(MaterialsOnHandView, { model: toMaterialsOnHandViewProps(materialsOnHandList) }));
    expect(populated).not.toContain("Purchase orders");
    const denied = htmlOf(createElement(MaterialsOnHandView, { model: toMaterialsOnHandViewProps({ rows: [], purchaseOrdersHref: null }) }));
    expect(denied).not.toContain("Purchase orders");
  });

  // #430: the potential recipe predictions read, asked only where it applies.
  it("MaterialView asks for extract potential on malt and adjunct only", () => {
    const of = (kind: string) => htmlOf(createElement(MaterialView, { model: { ...materialCitra, kind, extractPotential: "1.037" } }));
    expect(of("Malt")).toMatch(/Extract potential/);
    expect(of("adjunct")).toMatch(/Extract potential/);
    expect(of("Hop")).not.toMatch(/Extract potential/);
  });

  it("the live material form mounts the shared controlled body", () => {
    const form = src("app/(app)/materials/material-form.tsx");
    expect(form).toMatch(/from "@\/components\/mgr\/views\/material"/);
    expect(form).toMatch(/<MaterialView\b/);
    expect(form).toMatch(/controls=\{\{/);
    expect(form).not.toMatch(/<Label\b|<Input\b|<Select\b|<Switch\b/);
  });

  it("the live materials page mounts MaterialsOnHandView and slots CountForm", () => {
    const page = src("app/(app)/materials/page.tsx");
    expect(page).toMatch(/<MaterialsOnHandView\b/);
    expect(page).toMatch(/<CountForm\b/);
    expect(page).toMatch(/<MaterialForm\b/);
    expect(page).not.toMatch(/CycleCountView/);
  });
});

describe("Vendors", () => {
  it("the Vendors inventory record is VendorsView", () => {
    expect((screen("Vendors").body as { type: unknown }).type).toBe(VendorsView);
    expect((screen("Vendors").body as { props: { model: unknown } }).props.model).toEqual(toVendorsViewProps(vendorsList));
  });

  // #1516 item 8: the shared RecordTable, with Edit kept on each row (#1586 assumption A).
  it("draws vendors through RecordTable with Edit on each row", () => {
    const html = htmlOf(createElement(VendorsView, { model: toVendorsViewProps(vendorsList) }));
    expect(html).toContain("<table");
    for (const header of ["Vendor", "Status", "Lead time", "Observed lead time", "Contracts"]) expect(html).toContain(`>${header}<`);
    expect(html.match(/>Edit</g)).toHaveLength(vendorsList.rows!.length * 2);
    expect(html).toContain(">7 days<");
  });

  // #1586: a vendor's name opens its page.
  it("vendor names are inert taps to Vendor detail in inventory and links live", () => {
    const html = htmlOf(createElement(VendorsView, { model: toVendorsViewProps(vendorsList) }));
    expect(html).toMatch(/data-tap="true" data-to="Vendor detail"[^>]*>Fictional Hop Supply</);
    const live = htmlOf(createElement(VendorsView, { model: toVendorsViewProps(vendorsList), linkRows: true }));
    for (const row of vendorsList.rows!) expect(live).toContain(`href="/vendors/${row.key}"`);
    expect(live.match(/>Edit</g)).toHaveLength(vendorsList.rows!.length * 2);
  });

  // #1586: one vendor's page, drawn once for the inventory and the live route.
  it("the Vendor detail inventory record is VendorDetailView over the fixture", () => {
    const body = screen("Vendor detail").body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(VendorDetailView);
    expect(body.props.model).toEqual(toVendorDetailViewProps(vendorDetail));
    const html = htmlOf(body as ReactNode);
    for (const heading of ["Contracts", "Open purchase orders", "Default materials"]) expect(html).toContain(`>${heading}</h2>`);
    expect(html).toMatch(/committed · .* received · .* on order · .* available/);
    expect(html).toContain(">PO-");
    expect(html).toMatch(/>Edit</);
  });

  it("Vendor detail leaves out the open purchase orders section when orders are not read", () => {
    const html = htmlOf(createElement(VendorDetailView, { model: toVendorDetailViewProps({ ...vendorDetail, purchaseOrders: null }) }));
    expect(html).not.toContain("Open purchase orders");
    expect(html).toContain(">Default materials</h2>");
  });

  it("the Vendor inventory record is VendorView", () => {
    expect((screen("Vendor").body as { type: unknown }).type).toBe(VendorView);
    const html = htmlOf(createElement(VendorView, { model: vendorEdit }));
    expect(html).toMatch(/>Save vendor</);
    expect(html).toMatch(/Phone/);
    expect(html).toContain("When Planning lists a material short and it resolves to this vendor, its buy-by date is the needed-by date less this lead time. Received orders show a separate observed average.");
  });

  it("the live vendor form mounts the shared controlled body", () => {
    const form = src("app/(app)/vendors/vendor-form.tsx");
    expect(form).toMatch(/from "@\/components\/mgr\/views\/vendor"/);
    expect(form).toMatch(/<VendorView\b/);
    expect(form).toMatch(/controls=\{\{/);
    expect(form).not.toMatch(/<Label\b|<Input\b|<Select\b/);
  });

  it("the Contracts inventory record is ContractsView", () => {
    expect((screen("Contracts").body as { type: unknown }).type).toBe(ContractsView);
    expect((screen("Contracts").body as { props: { model: unknown } }).props.model).toEqual(toContractsViewProps(contractsList));
  });

  // #1586: the Vendors list and the vendor page build a contract row once.
  it("contractRowView names the vendor only when given one, and only then offers Edit", () => {
    const c = { id: "c", contract_no: "CITRA-2026", material_name: "Citra", qty_committed: 1000, qty_received: 262.5, qty_on_order: 100, qty_available: 637.5 };
    expect(contractRowView(c, "Fictional Hop Supply")).toEqual({
      key: "c", title: "Fictional Hop Supply · CITRA-2026", detail: "1,000 committed · 262.5 received · 100 on order · 637.5 available", verb: "Edit", warning: false,
    });
    expect(contractRowView({ ...c, contract_no: null })).toEqual({
      key: "c", title: "Citra", detail: "1,000 committed · 262.5 received · 100 on order · 637.5 available", verb: undefined, warning: false,
    });
    expect(contractRowView({ ...c, contract_no: null, material_name: null, qty_available: 0 }, "Fictional Hop Supply")).toMatchObject({ title: "Fictional Hop Supply · contract", warning: true });
  });

  it("ContractsView draws no Edit for a row without a verb", () => {
    const model = toContractsViewProps({ rows: [{ key: "c", title: "Citra", detail: "1 committed" }] });
    const html = htmlOf(createElement(ContractsView, { model, header: E.group("Contracts") }));
    expect(html).toContain("Citra");
    expect(html).not.toContain("<button");
  });

  it("the Contract inventory record is ContractView", () => {
    expect((screen("Contract").body as { type: unknown }).type).toBe(ContractView);
    const html = htmlOf(createElement(ContractView, { model: contractEdit }));
    expect(html).toMatch(/>Save contract</);
    expect(html).toMatch(/Contract number/);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Delete contract");
    const creating = htmlOf(createElement(ContractView, { model: contractEdit, remove: null }));
    expect(creating).not.toContain("Delete contract");
  });

  it("holds Save contract for missing, invalid, or exponent-notation values", () => {
    expect(contractSubmitReason({ vendorId: "", materialId: "", quantity: "", unitCost: "", starts: "", ends: "" })).toBeTruthy();
    expect(contractSubmitReason({ vendorId: "vendor", materialId: "material", quantity: "1", unitCost: "-1", starts: "", ends: "" })).toBeTruthy();
    expect(contractSubmitReason({ vendorId: "vendor", materialId: "material", quantity: "1e3", unitCost: "", starts: "", ends: "" })).toBeTruthy();
    expect(contractSubmitReason({ vendorId: "vendor", materialId: "material", quantity: "1.5", unitCost: "0", starts: "", ends: "" })).toBeNull();
  });

  it("waits to show contract errors in live controlled fields", () => {
    const negativeModel = { ...contractEdit, unitCost: "-1" };
    const controlled = htmlOf(createElement(ContractView, { model: negativeModel, controls: { quantity: () => {}, unitCost: () => {} } }));
    const controlledCost = /<input\b[^>]*id="[^"]+-cost"[^>]*>/.exec(controlled)?.[0];
    expect(controlledCost).toBeDefined();
    expect(controlledCost).not.toContain('aria-invalid="true"');
    const negativeCost = htmlOf(createElement(ContractView, { model: negativeModel }));
    const cost = /<input\b[^>]*id="[^"]+-cost"[^>]*>/.exec(negativeCost)?.[0];
    expect(cost).toContain('aria-invalid="true"');
    const errorId = /\bid="([^"]+-error)"/.exec(negativeCost)?.[1];
    expect(errorId).toBeDefined();
    const descriptions = /aria-describedby="([^"]+)"/.exec(cost!)?.[1].split(/\s+/);
    expect(descriptions).toContain(errorId);
    expect(negativeCost).toMatch(/<button[^>]*disabled[^>]*>Save contract<\/button>/);
    const exponentQuantity = htmlOf(createElement(ContractView, { model: { ...contractEdit, quantity: "1e3" } }));
    const quantity = /<input\b[^>]*id="[^"]+-quantity"[^>]*>/.exec(exponentQuantity)?.[0];
    expect(quantity).toContain('aria-invalid="true"');
    expect(exponentQuantity).toMatch(/<button[^>]*disabled[^>]*>Save contract<\/button>/);
  });

  it("the contract's inline field pairs render without a React key warning (E.inline owns the keys)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    htmlOf(createElement(ContractView, { model: contractEdit }));
    const errors = error.mock.calls.flat().join(" ");
    error.mockRestore();

    expect(errors).not.toContain('unique "key" prop');
  });

  it("the live contract form mounts the shared controlled body", () => {
    const form = src("app/(app)/vendors/contract-form.tsx");
    expect(form).toMatch(/from "@\/components\/mgr\/views\/contract"/);
    expect(form).toMatch(/<ContractView\b/);
    expect(form).toMatch(/controls=\{controls\}/);
    expect(form).not.toMatch(/<Label\b|<Input\b|<Select\b/);
  });

  it("the live vendors page mounts the shared vendor and contract views", () => {
    const page = src("app/(app)/vendors/page.tsx");
    expect(page).toMatch(/<VendorsView\b/);
    expect(page).toMatch(/<ContractsView\b/);
    expect(page).toMatch(/<VendorForm\b/);
    expect(page).toMatch(/<ContractForm\b/);
  });
});

// #994: an empty search is not an empty list.
describe("Vendors and Materials on hand search", () => {
  it("say nothing matches, not nothing yet, when a search is on", () => {
    expect(toVendorsViewProps({ rows: [], filtered: true }).empty).toEqual({ title: "No vendors match", description: "Clear the search to see every vendor." });
    expect(toVendorsViewProps({ rows: [] }).empty?.title).toBe("No vendors yet");
    expect(toMaterialsOnHandViewProps({ rows: [], filtered: true }).empty).toEqual({ title: "No materials match", description: "Clear the search or choose All types to see every material." });
    expect(toMaterialsOnHandViewProps({ rows: [] }).empty?.title).toBe("No materials yet");
    // #1112: the page's only action is Add material, so the empty state starts there. Receiving
    // is the one step that works for every material: a lot-tracked one with no lot can't be counted in.
    expect(toMaterialsOnHandViewProps({ rows: [] }).empty?.description).toBe("Add a material, then receive a purchase order to put it on hand.");
    // A vendor search narrows Contracts too, so its empty footer is a no-match, not no contracts.
    expect(toContractsViewProps({ rows: [], filtered: true }).empty).toEqual({ title: "No contracts match", description: "Clear the search to see every contract." });
    expect(toContractsViewProps({ rows: [] }).empty?.title).toBe("No contracts yet");
    // These are vendor contracts: a material bought, not beer promised to a customer (#1029).
    expect(toContractsViewProps({ rows: [] }).empty?.description).toBe("A contract records a quantity of a material a vendor commits to supply, which purchase orders then draw down.");
  });
});

describe("New PO lines", () => {
  // One check decides which rows count: the form saves only when newPoReason
  // finds nothing missing, and the view marks the same bad values per field.
  it("a line counts only with a material and a positive quantity", () => {
    const counts = (line: { materialId?: string; qty: number | string }) => newPoReason({ vendor: "v", lines: [{ ...line, cost: "" }] }) === null;
    expect(counts({ materialId: "malt", qty: "4" })).toBe(true);
    expect(counts({ materialId: "malt", qty: 0.5 })).toBe(true);
    expect(counts({ materialId: "malt", qty: "0" })).toBe(false);
    expect(counts({ materialId: "malt", qty: "" })).toBe(false);
    expect(counts({ materialId: "", qty: "4" })).toBe(false);
    expect(counts({ qty: 4 })).toBe(false);
  });

  it("every row is required, removable when there is more than one, and a zero quantity is flagged once left", () => {
    const noop = () => {};
    const remove = vi.fn();
    const model = {
      backHref: "/purchase-orders", vendor: "vendor", vendors: [{ id: "vendor", name: "Fictional Malt Supply" }],
      materials: [{ id: "malt", name: "2-row", purchase_uom: "bag", lot_tracked: false }], expected: "",
      lines: [
        { key: "0", materialId: "malt", title: "2-row", detail: "", qty: "4", cost: "" },
        { key: "1", materialId: "malt", title: "2-row", detail: "", qty: "0", cost: "" },
      ],
    };
    const html = renderToStaticMarkup(createElement(NewPoView, { model, controls: { material: noop, quantity: noop, remove } }));
    const line = (n: number) => html.slice(html.indexOf(`Line ${n} material`), html.indexOf(`Line ${n} unit cost`));
    expect(line(1)).toContain("required");
    // A live line waits for its quantity's blur (useTouchedLines); a drawn one shows the state it depicts.
    expect(html).not.toContain('aria-invalid="true"');
    const drawn = renderToStaticMarkup(createElement(NewPoView, { model, controls: { remove } }));
    const drawnLine = (n: number) => drawn.slice(drawn.indexOf(`Line ${n} material`), drawn.indexOf(`Line ${n} unit cost`));
    expect(drawnLine(1)).not.toContain('aria-invalid="true"');
    expect(drawnLine(2)).toContain('aria-invalid="true"');
    expect(html.match(/>Remove</g)).toHaveLength(2);
    const single = renderToStaticMarkup(createElement(NewPoView, { model: { ...model, lines: model.lines.slice(0, 1) }, controls: { remove } }));
    expect(single).not.toContain(">Remove<");
  });

  it("the inventory New PO draws Remove on its lines too, and none is flagged", () => {
    const html = htmlOf(createElement(NewPoView, { model: newPoDraft }));
    expect(html.match(/>Remove</g)).toHaveLength(newPoDraft.lines.length);
    expect(html).not.toContain('aria-invalid="true"');
  });

  it("the live form saves only when every line counts, through the shared check", () => {
    const form = src("app/(app)/purchase-orders/new-po-form.tsx");
    expect(form).toMatch(/remove: index =>/);
    expect(src("components/mgr/views/new-po.tsx")).not.toMatch(/const started\b/);
  });
});


it("shows exact signed lot adjustments with base units before material-count confirmation", () => {
  const markup = htmlOf(createElement(CycleCountView, { model: { lines: [{
    key: "hops", material: "Hops", qty: "45", units: ["lb"], unitIndex: 0, preview: "system 60 · variance -15",
    adjustments: [
      { key: "lot-1", lot: "S-24", expected: 10, counted: 0, delta: -10, unit: "lb" },
      { key: "lot-2", lot: "S-25", expected: 20, counted: 15, delta: -5, unit: "lb" },
    ],
  }] }, footer: null }));
  expect(markup).toContain("S-24");
  expect(markup).toContain("S-25");
  expect(markup).toContain("-10 lb");
  expect(markup).toContain("before 20 · after 15 lb");
  expect(markup).not.toContain("allocation preview");
});


it("preserves four-decimal base quantities in the exact count preview", () => {
  const markup = renderToStaticMarkup(createElement(CycleCountView, { model: { lines: [{
    key: "hops", material: "Hops", qty: "1.0001", units: ["lb"], unitIndex: 0, preview: "system 1",
    adjustments: [{ key: "tiny", lot: "Lot tiny", expected: 1, counted: 1.0001, delta: 0.0001, unit: "lb" }],
  }] } }));
  expect(markup).toContain("after 1.0001 lb");
  expect(markup).toContain("adjustment +0.0001 lb");
});

it("receipt history uses frozen units and names and exposes explicit revision links", () => {
  const snapshot = {
    id: "po", po_no: 1, status: "partially_received",
    lines: [{ id: "line", qty_open: 2, material: { name: "Renamed", purchase_uom: "kg", purchase_uom_factor: 99, base_uom: "kg" } }],
    receipts: [{ id: "old", received_on: "2026-09-20", corrected_by_receipt_id: "new", correction_reason: null,
      receipt_lines: [{ po_line_id: "line", qty_counted: 3, variance: -1, material_name: "Original malt", purchase_uom: "each", purchase_uom_factor: 5, base_uom: "lb", lot_code: "MALT-A", lot_best_by: "2027-01-01" }] }],
  };
  const model = toPostedReceiptViewProps(snapshot, "old", "/purchase-orders/po")!;
  expect(model.tape[0][0]).toBe("+15 lb Original malt · receipt");
  expect(model.tape[0][1]).toContain("MALT-A · best by Jan 1, 2027");
  expect(model.info).toMatch(/^Received Sep 20, 2026\./);
  expect(model.info).toContain("superseded");
});

describe("past PO Expected date (#1489)", () => {
  const html = (expected: string) => htmlOf(createElement(NewPoView, { model: { ...newPoDraft, expected, today: "2026-10-23" } }));
  it("warns before the brewery's today without blocking Save draft", () => {
    expect(html("2026-10-03")).toContain("This expected date is in the past for your brewery. You can still save the PO.");
    expect(html("2026-10-24")).not.toContain("in the past");
    expect(html("")).not.toContain("in the past");
  });
});
