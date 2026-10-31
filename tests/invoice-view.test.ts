// tests/invoice-view.test.ts — Invoice inventory and the live invoice page
// share InvoiceView. Fixtures are get_invoice + questions; mapping rows are
// presentation, not a mode flag. Tests paint the view, not SCREENS.
import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { InvoiceView, RecordPaymentView } from "../components/mgr/views/invoice";
import { creditMemoAls, invoiceEditedInQbo, invoiceFailedAls, invoiceLocalCreditBalance, invoiceLocalPartlyPaid, invoicePartlyPaid } from "../lib/mgr/fixtures/invoice";
import { ALS } from "../lib/mgr/fixtures/demo";
import { invoiceMappingRows, invoicePaymentAmountError, invoicePaymentReason, toInvoiceViewProps } from "../lib/mgr/invoice-view";
import { invoiceIsCreditable } from "../lib/mgr/invoice-state";

const htmlOf = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(createElement("div", null, node));

describe("Invoice view", () => {
  it("caps payment at the credited balance and refuses payment after credit-only settlement", () => {
    const snapshot = { ...invoiceFailedAls, localCreditCents: 7600 };
    const model = toInvoiceViewProps(snapshot);
    expect(model.paymentBalanceCents).toBe(53900);
    const settled = toInvoiceViewProps({ ...snapshot, localCreditCents: 61500, invoice: { ...snapshot.invoice, paid_at: "2026-10-20T04:00:00Z" } });
    expect(settled.paymentBalanceCents).toBeNull();
  });

  it("refuses payment when a paid invoice has excess credit", () => {
    const model = toInvoiceViewProps(invoiceLocalCreditBalance);
    expect(model.paymentBalanceCents).toBeNull();
  });
  it("checks mappings in the current realm, deduplicates SKUs, and gates unavailable fixes", () => {
    const customer = { name: "Actual customer", qbo_customer_id: "00227", qbo_realm_id: "current" };
    const line = { id: "line1", kind: "sku", sku_id: "sku1", description: "Actual SKU", skus: { name: "Actual SKU", qbo_item_id: "009", qbo_realm_id: "old" } };
    const rows = invoiceMappingRows(customer, [line, { ...line, id: "line2" }, { ...line, id: "deposit", kind: "keg_deposit", sku_id: null }], "current", null, false);
    // A mapped customer needs no action, so it is not a row.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ title: "Actual SKU", detail: "QuickBooks item is missing", unavailable: false });
    expect(rows[1]).toMatchObject({ unavailable: true });
    expect(invoiceMappingRows(customer, [{ ...line, skus: { ...line.skus, qbo_realm_id: "current" } }], "current", null, false)).toEqual([]);
    expect(invoiceMappingRows({ ...customer, qbo_realm_id: "old" }, [], "current", null, false)[0]).toMatchObject({ title: "Customer mapping", detail: "QuickBooks customer is missing" });
    expect(invoiceMappingRows(null, [], "current", null, false)[0].unavailable).toBe(true);
  });
  it("asks for the one-way keg fee item only when a fee line has none", () => {
    const customer = { name: "Export buyer", qbo_customer_id: "1", qbo_realm_id: "current" };
    const fee = { id: "fee", kind: "one_way_keg_fee", sku_id: null, description: "One-way keg fee", skus: null };
    expect(invoiceMappingRows(customer, [fee], "current", null, true).map(row => row.title))
      .toEqual(["One-way keg fee mapping"]);
    expect(invoiceMappingRows(customer, [fee], "current", null, false, "fee-item")).toEqual([]);
  });
  it("lists each needed mapping once, with one Fix mapping action for the invoice, not a Fix per row (#1515)", () => {
    const mappings = Array.from({ length: 7 }, (_, n) => ({ key: `sku${n}`, title: `SKU ${n}`, detail: "QuickBooks item is missing", tone: "w" as const }));
    const html = htmlOf(createElement(InvoiceView, { model: { ...toInvoiceViewProps(invoiceFailedAls), mappings }, quickbooks: { detail: "mapping required before push" }, accountingActions: "Fix mapping" }));
    expect(html.match(/QuickBooks item is missing/g)).toHaveLength(7);
    expect(html).not.toMatch(/>Fix</);
    expect(html.match(/Fix mapping/g)).toHaveLength(1);
    // A row MGR cannot fix still says so.
    const unavailable = htmlOf(createElement(InvoiceView, { model: { ...toInvoiceViewProps(invoiceFailedAls), mappings: [{ ...mappings[0], unavailable: true }] }, quickbooks: { detail: "mapping required before push" } }));
    expect(unavailable).toContain("Mapping unavailable");
  });
  it("shows no mapping rows on an invoice that will never be pushed (not_synced, #1515)", () => {
    const model = toInvoiceViewProps({ ...invoiceFailedAls, invoice: { ...invoiceFailedAls.invoice, qbo_sync_status: "not_synced" } });
    expect(invoiceFailedAls.mappings).not.toHaveLength(0);
    expect(model.mappings).toBeUndefined();
  });
  it("keeps the action-needed mappings and questions beside shared QuickBooks status and authorized actions", () => {
    const html = htmlOf(createElement(InvoiceView, { model: toInvoiceViewProps(invoiceFailedAls), quickbooks: { detail: "push failed · QuickBooks item mapping required" }, accountingActions: "Retry exact push" }));
    expect(html).toContain("Push failed · QuickBooks item mapping required");
    expect(html).toContain("Pils · case");
    expect(html).toContain("Retry exact push");
    expect(html).toContain("Mark answered");
    expect(html).not.toContain("Push invoice to QuickBooks Online");
    // The push alert repeated the mapping detail.
    expect(html).not.toContain("Push becomes available");
  });
  it("maps get_invoice + questions through the adapter as separate facts", () => {
    const model = toInvoiceViewProps(invoiceFailedAls);
    expect(model.title).toBe("INV-1039");
    expect(model.backHref).toBeUndefined();
    expect(model.customer).toBe(ALS.name);
    expect(model.state).toEqual({ label: "Unpaid", tone: "" });
    expect(model.facts).toEqual([{ label: "Issued", value: "Sep 3, 2026" }, { label: "Due", value: "Oct 3, 2026" }]);
    // A missing due date stays missing; it never borrows the issued date.
    expect(toInvoiceViewProps({ ...invoiceFailedAls, invoice: { ...invoiceFailedAls.invoice, due_on: null } }).facts[1]).toEqual({ label: "Due", value: "Not set" });
    expect(model.lines).toHaveLength(5);
    expect(model.lines[1]).toEqual({ key: "il-pils", name: "Pils · 16 oz case", qty: "5", unitPrice: "$38.00", amount: "$190.00" });
    expect(model.questions[0]).toEqual({ key: "00000000-0000-4000-8000-000000001139", id: "00000000-0000-4000-8000-000000001139", body: "The Pils count looks short.", askedOn: "Sep 1, 2026", answered: false });
    expect(model.mappings).toEqual(invoiceFailedAls.mappings);
  });
  it("groups the summary by exact line kind, never by the wording of a description", () => {
    const { summary } = toInvoiceViewProps(invoiceFailedAls);
    expect(summary.rows).toEqual([
      { label: "Items", value: "$540.00" },
      { label: "Keg deposits", value: "$60.00" },
      { label: "One-way keg fees", value: "$15.00" },
    ]);
    expect(summary.total).toEqual({ label: "Total", value: "$615.00" });
    const misleading = { ...invoiceFailedAls, lines: [
      { id: "a", kind: "adjustment", qty: 1, unit_price_cents: -500, amount_cents: -500, description: "Keg deposit refund (goodwill)", skus: null },
      { id: "r", kind: "keg_deposit_refund", qty: -1, unit_price_cents: 3000, amount_cents: -3000, description: "Returned shell", skus: null },
    ] };
    expect(toInvoiceViewProps(misleading).summary.rows).toEqual([
      { label: "Keg deposits", value: "−$30.00" },
      { label: "Adjustments", value: "−$5.00" },
    ]);
  });
  it("keeps the stored line amount authoritative and a credit signed", () => {
    const odd = { ...invoiceFailedAls, lines: [{ id: "x", kind: "sku", qty: 3, unit_price_cents: 333, amount_cents: 1000, description: "Rounded", skus: null }] };
    const model = toInvoiceViewProps(odd);
    expect(model.lines[0]).toMatchObject({ name: "Rounded", qty: "3", unitPrice: "$3.33", amount: "$10.00" });
    expect(model.summary.total?.value).toBe("$10.00");
    const credit = toInvoiceViewProps(creditMemoAls);
    expect(credit.title).toBe("CM-1040");
    expect(credit.state).toEqual({ label: "Credit memo", tone: "ok" });
    expect(credit.summary.total).toEqual({ label: "Credit memo total", value: "−$76.00" });
    // A stale positive QuickBooks balance is never shown as due on a credit memo.
    expect(credit.summary.settlement).toBeUndefined();
  });
  it("shows the balance and cash from QuickBooks, Unknown when none is supplied", () => {
    const partly = toInvoiceViewProps(invoicePartlyPaid);
    expect(partly.state).toEqual({ label: "Partially paid", tone: "" });
    expect(partly.summary.total).toEqual({ label: "Total", value: "$615.00" });
    expect(partly.summary.settlement).toEqual([
      { label: "Outstanding balance", value: "$315.00", strong: true },
      { label: "Cash received in QuickBooks", value: "$300.00" },
    ]);
    // A pending push leaves the balance with QuickBooks, which has not supplied one (#1045 Q3).
    expect(toInvoiceViewProps({ ...invoiceFailedAls, hasPendingPush: true }).summary.settlement).toEqual([{ label: "Outstanding balance", value: "Unknown", strong: true }]);
    // Zero balance with no cash is settled, not paid.
    const settled = toInvoiceViewProps({ ...invoicePartlyPaid, invoice: { ...invoicePartlyPaid.invoice, qbo_balance_cents: 0, qbo_cash_collected_cents: 0 } });
    expect(settled.state).toEqual({ label: "Settled", tone: "ok" });
    expect(settled.summary.settlement).toEqual([{ label: "Outstanding balance", value: "$0.00", strong: true }]);
  });
  it.each([
    ["voided", { qbo_remote_state: "voided" as const }, "Voided"],
    ["deleted", { qbo_remote_state: "deleted" as const }, "Deleted in QuickBooks"],
    ["written off", { written_off_at: "2026-09-20T12:00:00Z" }, "Written off"],
  ])("a %s invoice shows no balance due", (_, patch, label) => {
    const model = toInvoiceViewProps({ ...invoicePartlyPaid, invoice: { ...invoicePartlyPaid.invoice, ...patch } });
    expect(model.state.label).toBe(label);
    expect(model.summary.settlement).toBeUndefined();
  });
  it("labels an edited QuickBooks total beside the frozen MGR subtotal only when QuickBooks flagged the edit", () => {
    const { summary } = toInvoiceViewProps(invoiceEditedInQbo);
    expect(summary.total).toEqual({ label: "Current invoice total", value: "$640.00" });
    expect(summary.rows.at(-1)).toEqual({ label: "Frozen MGR line subtotal", value: "$615.00" });
    expect(summary.note).toMatch(/original lines do not change/);
    // An edit that left the total unchanged is still an edit.
    const same = toInvoiceViewProps({ ...invoiceEditedInQbo, invoice: { ...invoiceEditedInQbo.invoice, qbo_total_cents: 61500 } }).summary;
    expect(same.total).toEqual({ label: "Current invoice total", value: "$615.00" });
    expect(same.note).toMatch(/Edited in QuickBooks/);
    // A QuickBooks zero wins over a nonzero local sum; without the edit flag it is not called edited.
    const zero = toInvoiceViewProps({ ...invoicePartlyPaid, invoice: { ...invoicePartlyPaid.invoice, qbo_total_cents: 0 } }).summary;
    expect(zero.total).toEqual({ label: "Total", value: "$0.00" });
    expect(zero.note).not.toMatch(/Edited/);
    const matched = toInvoiceViewProps(invoicePartlyPaid).summary;
    expect(matched.rows.map(row => row.label)).not.toContain("Frozen MGR line subtotal");
    expect(matched.note).toBe("From QuickBooks.");
    expect(toInvoiceViewProps(invoiceFailedAls).summary.note).toBe("Sum of the invoice lines.");
  });
  it("adds the QuickBooks tax to an unedited taxed invoice so the rows reach the Total", () => {
    const taxed = toInvoiceViewProps({ ...invoicePartlyPaid, invoice: { ...invoicePartlyPaid.invoice, qbo_total_cents: 66420, qbo_tax_cents: 4920 } }).summary;
    expect(taxed.rows.at(-1)).toEqual({ label: "Tax (QuickBooks)", value: "$49.20" });
    expect(taxed.rows.map(row => row.label)).not.toContain("Frozen MGR line subtotal");
    expect(taxed.total).toEqual({ label: "Total", value: "$664.20" });
    expect(taxed.note).toBe("From QuickBooks.");
  });
  it("reads a voided invoice as a $0.00 total with no balance and no edit note", () => {
    const voided = toInvoiceViewProps({ ...invoicePartlyPaid, invoice: { ...invoicePartlyPaid.invoice, qbo_remote_state: "voided", qbo_total_cents: 0, qbo_balance_cents: 0, qbo_cash_collected_cents: 0 } });
    expect(voided.state.label).toBe("Voided");
    expect(voided.summary.rows.map(row => row.label)).toEqual(["Items", "Keg deposits", "One-way keg fees"]);
    expect(voided.summary.total).toEqual({ label: "Total", value: "$0.00" });
    expect(voided.summary.note).toBe("Voided in QuickBooks. Nothing is owed.");
    expect(voided.summary.settlement).toBeUndefined();
  });
  it("shows no Unknown balance under Paid when the paid invoice has no QuickBooks balance", () => {
    const paid = toInvoiceViewProps({ ...invoiceFailedAls, invoice: { ...invoiceFailedAls.invoice, paid_at: "2025-08-14T12:00:00Z", qbo_balance_cents: null } });
    expect(paid.state.label).toBe("Paid");
    expect(paid.summary.settlement).toBeUndefined();
  });

  it("omits mapping rows when the snapshot has none", () => {
    const model = toInvoiceViewProps({
      timeZone: invoiceFailedAls.timeZone,
      invoice: invoiceFailedAls.invoice,
      lines: invoiceFailedAls.lines,
      questions: invoiceFailedAls.questions,
      payments: [],
      hasPendingPush: false,
      wasPushedToQbo: false,
      localPaidCents: 0,
      localCreditCents: 0,
    });
    expect(model.mappings).toBeUndefined();
    const html = htmlOf(createElement(InvoiceView, { model }));
    expect(html).not.toMatch(/Push invoice/);
    expect(html).not.toMatch(/Pils · case/);
    expect(html).toContain(ALS.name);
  });


  it("draws one total in the summary, a line table, and the question once without its customer or a repeated title", () => {
    const html = htmlOf(createElement(InvoiceView, { model: toInvoiceViewProps(invoicePartlyPaid) }));
    expect(html.match(/\$615\.00/g)).toHaveLength(1);
    expect(html).toContain("Outstanding balance");
    for (const head of ["Description", "Quantity", "Unit price", "Amount"]) expect(html).toContain(`>${head}</th>`);
    expect(html).toContain("“The Pils count looks short.”");
    expect(html).not.toContain("Buyer asked about this invoice");
    expect(html).not.toContain("Dana");
    expect(html.match(new RegExp(ALS.name, "g"))).toHaveLength(1);
  });

  it("closes with Return: an inert fixture button when omitted, nothing when null", () => {
    const model = toInvoiceViewProps(invoiceFailedAls);
    expect(htmlOf(createElement(InvoiceView, { model }))).toMatch(/Correct a shipment[\s\S]*>Return</);
    const none = htmlOf(createElement(InvoiceView, { model, correction: null }));
    expect(none).not.toContain("Correct a shipment");
    expect(htmlOf(createElement(InvoiceView, { model, correction: "Live return link" }))).toContain("Live return link");
  });

  it("a qbo slot replaces mapping rows and the push button", () => {
    const html = htmlOf(createElement(InvoiceView, {
      model: toInvoiceViewProps(invoiceFailedAls),
      qbo: "QuickBooks mapping and push aren’t connected yet",
    }));
    expect(html).toMatch(/aren’t connected yet/);
    expect(html).not.toMatch(/Push invoice/);
    expect(html).not.toMatch(/Pils · case/);
    expect(html).toMatch(/Mark answered/);
  });

  it("the Invoice inventory record is InvoiceView painted from that fixture", () => {
    const body = SCREENS.find((s) => s.name === "Invoice")!.body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(SCREENS.find((s) => s.name === "Invoice")!.body)).toBe(true);
    expect(body.type).toBe(InvoiceView);
    expect(body.props.model).toEqual(toInvoiceViewProps(invoiceFailedAls));
  });

  it("the live invoice page mounts InvoiceView with no second E.* tree", () => {
    const src = readFileSync("app/(app)/invoices/[id]/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/invoice"/);
    expect(src).toMatch(/<InvoiceView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).not.toMatch(/qboGate=|<QboInvoiceRow/);
    expect(src).toMatch(/<QboInvoiceActions/);
    expect(src).toMatch(/<MarkAnswered\b/);
  });

  it("offers Return only on an invoice that is still owed or paid, never voided, deleted, or written off (#418)", () => {
    const base = { kind: "invoice" as const, paid_at: null, qbo_remote_state: "live" as const, qbo_balance_cents: null, written_off_at: null };
    expect(invoiceIsCreditable(base)).toBe(true);
    expect(invoiceIsCreditable({ ...base, paid_at: "2026-09-01", qbo_balance_cents: 0 })).toBe(true);
    expect(invoiceIsCreditable({ ...base, written_off_at: "2026-09-02" })).toBe(false);
    expect(invoiceIsCreditable({ ...base, qbo_remote_state: "voided" })).toBe(false);
    expect(invoiceIsCreditable({ ...base, qbo_remote_state: "deleted" })).toBe(false);
    expect(invoiceIsCreditable({ ...base, kind: "credit_memo" })).toBe(false);
    const src = readFileSync("app/(app)/invoices/[id]/page.tsx", "utf8");
    expect(src).toMatch(/invoiceIsCreditable\(invoice\) && canRun\(ctx, "return_shipment"\)/);
    // Return corrects a shipment; it closes the page instead of heading it.
    expect(src).toMatch(/correction=\{/);
    expect(src).not.toMatch(/headerAction=/);
  });
});


it.each(["Not pushed", "Disconnected", "Deleted in QuickBooks", "Pushed to QuickBooks"])("keeps staff navigation unavailable for %s without a verified destination", detail => {
  const html = htmlOf(createElement(InvoiceView, { model: { ...toInvoiceViewProps(invoiceFailedAls), mappings: [] }, quickbooks: { detail } }));
  expect(html).toContain("Open in QuickBooks");
  expect(html).toContain("A verified provider link is unavailable");
  expect(html).not.toMatch(/href="https:\/\/[^"]*intuit\.com/);
});

it("renders a verified staff destination through the shared invoice view", () => {
  const html = htmlOf(createElement(InvoiceView, { model: toInvoiceViewProps(invoiceFailedAls), quickbooks: { detail: "Pushed" }, staffLink: { href: "https://app.qbo.intuit.com/app/invoice?txnId=34&companyId=4620000000000000", reason: null } }));
  expect(html).toContain('href="https://app.qbo.intuit.com/app/invoice?txnId=34&amp;companyId=4620000000000000"');
  expect(html).not.toContain("verified provider link is unavailable");
});

describe("Invoice payments recorded in MGR (#1045)", () => {
  it("shows a local partly paid invoice's outstanding balance and paid amount, and no mapping rows", () => {
    const model = toInvoiceViewProps(invoiceLocalPartlyPaid);
    expect(model.state).toEqual({ label: "Partially paid", tone: "" });
    expect(model.summary.settlement).toEqual([
      { label: "Outstanding balance", value: "$315.00", strong: true },
      { label: "Paid in MGR", value: "$300.00" },
    ]);
    // The snapshot carries mapping rows; an unvoided payment blocks the push they serve.
    expect(invoiceLocalPartlyPaid.mappings).not.toHaveLength(0);
    expect(model.mappings).toBeUndefined();
    expect(model.paymentBalanceCents).toBe(31500);
  });
  it("lists each payment newest first, and a voided one with its reason", () => {
    expect(toInvoiceViewProps(invoiceLocalPartlyPaid).payments).toEqual([
      { key: "pay-check", id: "pay-check", amount: "$300.00", receivedOn: "Sep 20, 2026", method: "Check", reference: "1182" },
      { key: "pay-cash", id: "pay-cash", amount: "$100.00", receivedOn: "Sep 12, 2026", method: "Cash", voidReason: "Counted twice" },
    ]);
  });
  it("owns the balance of a never-pushed invoice: the line total is outstanding", () => {
    const model = toInvoiceViewProps(invoiceFailedAls);
    expect(model.state).toEqual({ label: "Unpaid", tone: "" });
    expect(model.summary.settlement).toEqual([{ label: "Outstanding balance", value: "$615.00", strong: true }]);
    expect(model.mappings).toEqual(invoiceFailedAls.mappings);
    expect(model.payments).toEqual([]);
    expect(model.paymentBalanceCents).toBe(61500);
  });
  it.each([
    ["a pending push (Q3)", { hasPendingPush: true }],
    ["a push to a previous QuickBooks company (Q4)", { wasPushedToQbo: true }],
  ])("keeps an Unknown balance and takes no payment for %s", (_, patch) => {
    const model = toInvoiceViewProps({ ...invoiceFailedAls, ...patch });
    expect(model.summary.settlement).toEqual([{ label: "Outstanding balance", value: "Unknown", strong: true }]);
    expect(model.paymentBalanceCents).toBeNull();
  });
  it("reads Paid with a $0.00 balance once payments reach the total", () => {
    const model = toInvoiceViewProps({
      ...invoiceLocalPartlyPaid,
      invoice: { ...invoiceLocalPartlyPaid.invoice, paid_at: "2026-09-20T04:00:00Z" },
      localPaidCents: 61500,
    });
    expect(model.state).toEqual({ label: "Paid", tone: "ok" });
    expect(model.summary.settlement).toEqual([
      { label: "Outstanding balance", value: "$0.00", strong: true },
      { label: "Paid in MGR", value: "$615.00" },
    ]);
    expect(model.paymentBalanceCents).toBeNull();
  });
  it("reads No payment due for a ledger-owned $0.00 invoice, which takes no payment (Design 4)", () => {
    const free = { ...invoiceFailedAls, lines: invoiceFailedAls.lines.map((l) => ({ ...l, unit_price_cents: 0, amount_cents: 0 })) };
    const model = toInvoiceViewProps(free);
    expect(model.state).toEqual({ label: "No payment due", tone: "ok" });
    expect(model.paymentBalanceCents).toBeNull();
  });
  it.each([
    ["written off (Q6)", { invoice: { ...invoiceFailedAls.invoice, written_off_at: "2026-09-20T12:00:00Z" } }],
    ["paid outside the ledger, as a historical import (Q7)", { invoice: { ...invoiceFailedAls.invoice, paid_at: "2025-08-14T12:00:00Z" } }],
    ["a QuickBooks invoice", { invoice: { ...invoiceFailedAls.invoice, qbo_invoice_id: "qbo-1039" } }],
  ])("takes no payment when %s", (_, patch) => {
    expect(toInvoiceViewProps({ ...invoiceFailedAls, ...patch }).paymentBalanceCents).toBeNull();
  });
  it("takes no payment on a credit memo", () => {
    expect(toInvoiceViewProps(creditMemoAls).paymentBalanceCents).toBeNull();
  });
  it("reads Written off, with no balance due, once a partly paid invoice is written off (#1228)", () => {
    const model = toInvoiceViewProps({
      ...invoiceLocalPartlyPaid,
      invoice: { ...invoiceLocalPartlyPaid.invoice, written_off_at: "2026-10-23T12:00:00Z" },
    });
    expect(model.state).toEqual({ label: "Written off", tone: "ok" });
    expect(model.summary.settlement).toBeUndefined();
    expect(model.payments).toHaveLength(2);
  });
});

describe("Invoice view: the Payments section (#1045)", () => {
  const model = toInvoiceViewProps(invoiceLocalPartlyPaid);
  const voidButtons = (html: string) => html.match(/>Void</g) ?? [];
  it("lists each payment, and a voided one with its reason", () => {
    const html = htmlOf(createElement(InvoiceView, { model }));
    expect(html).toContain('id="invoice-payments"');
    for (const text of ["$300.00", "Sep 20, 2026", "Check", "1182", "$100.00", "Cash", "Voided", "Counted twice"]) expect(html).toContain(text);
  });
  it("draws the inert Record payment and one Void, on the unvoided payment, when the slots are omitted", () => {
    const html = htmlOf(createElement(InvoiceView, { model }));
    expect(html).toContain("Record payment");
    expect(voidButtons(html)).toHaveLength(1);
  });
  it("draws neither when the slots are null", () => {
    const html = htmlOf(createElement(InvoiceView, { model, recordPayment: null, paymentAction: null }));
    expect(html).not.toContain("Record payment");
    expect(voidButtons(html)).toHaveLength(0);
  });
  it("passes each unvoided payment to a paymentAction function", () => {
    const html = htmlOf(createElement(InvoiceView, { model, paymentAction: (p) => createElement("span", null, `void-${p.id}`) }));
    expect(html).toContain("void-pay-check");
    expect(html).not.toContain("void-pay-cash");
  });
  it("draws no default Record payment on an invoice that takes no payment", () => {
    const html = htmlOf(createElement(InvoiceView, { model: toInvoiceViewProps(invoiceEditedInQbo) }));
    expect(html).not.toContain("Record payment");
    expect(html).not.toContain('id="invoice-payments"');
  });
});

describe("RecordPaymentView (#1045)", () => {
  const value = { amount: "", receivedOn: "2026-10-23", method: "" as const, reference: "" };
  const fields = (quickbooksConnected: boolean) =>
    htmlOf(createElement(RecordPaymentView, { value, maxCents: 31500, maxDate: "2026-10-23", quickbooksConnected }));
  it("caps the amount at the balance (Q1) and the received date at today (Q10)", () => {
    const html = fields(false);
    expect(html).toContain('max="315"');
    expect(html).toContain('max="2026-10-23"');
    for (const text of ["Amount ($)", "Received on", "Method", "Reference · optional"]) expect(html).toContain(text);
  });
  it("says the invoice will not be sent to QuickBooks only when QuickBooks is connected", () => {
    const sentence = "This invoice will not be sent to QuickBooks while it has payments recorded in MGR.";
    expect(fields(true)).toContain(sentence);
    expect(fields(false)).not.toContain(sentence);
  });
});

describe("invoicePaymentReason (#1485)", () => {
  const ready = { amount: "100.00", receivedOn: "2026-10-01", method: "check" as const, reference: "" };
  const today = "2026-10-23";
  it("is null for an amount up to the balance with a date and a method", () => {
    expect(invoicePaymentReason(ready, 31500, today)).toBeNull();
    expect(invoicePaymentReason({ ...ready, amount: "315.00" }, 31500, today)).toBeNull();
    expect(invoicePaymentReason({ ...ready, receivedOn: today }, 31500, today)).toBeNull();
  });
  it("accepts a date before the invoice was issued: a prepayment (Q10)", () => {
    expect(invoicePaymentReason({ ...ready, receivedOn: "2026-08-01" }, 31500, today)).toBeNull();
  });
  it.each([
    ["no amount", { amount: "" }, "an amount from $0.01 to $315.00"],
    ["zero", { amount: "0" }, "an amount from $0.01 to $315.00"],
    ["a negative amount", { amount: "-5" }, "an amount from $0.01 to $315.00"],
    ["a fraction of a cent", { amount: "0.001" }, "an amount from $0.01 to $315.00"],
    ["a non-number", { amount: "abc" }, "an amount from $0.01 to $315.00"],
    ["above the balance (Q1)", { amount: "315.01" }, "an amount from $0.01 to $315.00"],
    ["far above the balance", { amount: "99999999999" }, "an amount from $0.01 to $315.00"],
    ["a date after today", { receivedOn: "2026-10-24" }, "a received day no later than today"],
    ["no date", { receivedOn: "" }, "a received day no later than today"],
    ["no method", { method: "" as const }, "a method"],
  ])("names %s", (_, patch, need) => {
    expect(invoicePaymentReason({ ...ready, ...patch }, 31500, today)).toBe(`Still needed: ${need}.`);
  });
  it("marks a bad amount at the field, but not an empty one", () => {
    expect(invoicePaymentAmountError("", 45000)).toBeUndefined();
    expect(invoicePaymentAmountError("450", 45000)).toBeUndefined();
    for (const amount of ["-5", "0", "0.001", "450.01", "99999999999"]) {
      expect(invoicePaymentAmountError(amount, 45000)).toBe("Enter an amount from $0.01 to $450.00, in dollars and cents.");
    }
    expect(invoicePaymentAmountError("1e3", 45000)).toMatch(/exponent notation/);
  });
  it("draws the amount error under Amount once the field is left", () => {
    const html = htmlOf(createElement(RecordPaymentView, { value: { ...ready, amount: "-5" }, maxCents: 31500, maxDate: today, quickbooksConnected: false, onChange: () => {}, amountTouched: true }));
    expect(html).toContain("Enter an amount from $0.01 to $315.00, in dollars and cents.");
    expect(htmlOf(createElement(RecordPaymentView, { value: { ...ready, amount: "-5" }, maxCents: 31500, maxDate: today, quickbooksConnected: false, onChange: () => {} }))).not.toContain("Enter an amount");
  });
});

describe("#1517 invoice ↔ order", () => {
  const shipped = { ...invoiceFailedAls.invoice, shipments: { orders: { id: "order-1", order_no: 3 } } };
  it("names the invoice's order as a fact, linked on the live page", () => {
    expect(toInvoiceViewProps({ ...invoiceFailedAls, invoice: shipped, backHref: "/invoices" }).facts)
      .toContainEqual({ label: "Order", value: "ORD-0003", href: "/orders/order-1" });
    // The inventory draws the fact without the staff route.
    expect(toInvoiceViewProps({ ...invoiceFailedAls, invoice: shipped }).facts).toContainEqual({ label: "Order", value: "ORD-0003" });
  });
  it("a document with no shipment, a credit memo, has no Order fact", () => {
    expect(toInvoiceViewProps({ ...invoiceFailedAls, invoice: { ...shipped, shipments: null }, backHref: "/invoices" }).facts.map((f) => f.label)).toEqual(["Issued", "Due"]);
  });
  it("draws a linked fact as a link", () => {
    const html = htmlOf(createElement(InvoiceView, { model: toInvoiceViewProps({ ...invoiceFailedAls, invoice: shipped, backHref: "/invoices" }) }));
    expect(html).toMatch(/<a[^>]*href="\/orders\/order-1"[^>]*>ORD-0003<\/a>/);
  });
  it("get_invoice reads the order through the shipment", () => {
    expect(readFileSync("lib/commands/orders.ts", "utf8")).toMatch(/from\("invoices"\)\.select\("\*, customers\([^)]*\), shipments\(orders\(id, order_no\)\)"\)/);
  });
});
