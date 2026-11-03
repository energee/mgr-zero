// tests/customer-open-balance.test.ts — the customer page's Open balance line
// (#1585): the register's balance rule summed over a customer's unpaid
// invoices, never $0.00 when a balance is unknown, and a link to the Invoices
// register filtered to that customer.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerView } from "../components/mgr/views/customer";
import { InvoicesView } from "../components/mgr/views/invoices";
import { customerRidgeline } from "../lib/mgr/fixtures/customers";
import { toCustomerViewProps } from "../lib/mgr/customer-view";
import { invoicesHref, invoiceStatusOptions, unpaidBalance, type InvoiceListRecord } from "../lib/mgr/invoices-view";

const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const pushed: InvoiceListRecord = { id: "pushed", invoice_no: 1042, kind: "invoice", due_on: "2026-09-12", paid_at: null, qbo_sync_status: "pushed", qbo_sync_error: null, qbo_remote_state: "live", qbo_balance_cents: 30000, qbo_cash_collected_cents: 0, qbo_accountant_drift: false, written_off_at: null, subtotal_cents: 98000, total_cents: 98000, has_pending_qbo_push: false, qbo_invoice_id: "qbo-1042", local_paid_cents: 0, local_credit_cents: 0, was_pushed_to_qbo: true, customers: { name: "Ridgeline" } };
// QuickBooks never received it, so MGR's ledger owns the balance: total less payments recorded in MGR.
const ledger: InvoiceListRecord = { ...pushed, id: "ledger", qbo_sync_status: "pending", qbo_invoice_id: null, was_pushed_to_qbo: false, qbo_balance_cents: null, total_cents: 50000, local_paid_cents: 20000 };
// Pushed, but QuickBooks has not supplied a balance yet.
const unknown: InvoiceListRecord = { ...pushed, id: "unknown", qbo_balance_cents: null };

describe("unpaidBalance", () => {
  it("sums QuickBooks and ledger balances by the register's rule", () => {
    expect(unpaidBalance([pushed, ledger])).toEqual({ cents: 60000, invoices: 2 });
  });

  it("is unknown, not zero, when any balance is unknown", () => {
    expect(unpaidBalance([pushed, unknown])).toEqual({ cents: null, invoices: 2 });
  });

  it("is zero with no unpaid invoices", () => {
    expect(unpaidBalance([])).toEqual({ cents: 0, invoices: 0 });
  });
});

describe("the customer's Open balance line", () => {
  it("reads the sum and the invoice count", () => {
    const model = (openBalance: Parameters<typeof toCustomerViewProps>[0]["openBalance"]) => toCustomerViewProps({ ...customerRidgeline, openBalance }).openBalance;
    expect(model({ cents: 60000, invoices: 2 })).toBe("$600.00 · 2 unpaid invoices");
    expect(model({ cents: 30000, invoices: 1 })).toBe("$300.00 · 1 unpaid invoice");
    expect(model({ cents: null, invoices: 2 })).toBe("Unknown · 2 unpaid invoices");
    expect(model({ cents: 0, invoices: 0 })).toBe("No unpaid invoices");
    // A role that may not read invoices gets no line at all.
    expect(model(undefined)).toBeNull();
  });

  it("links to the Invoices register filtered to the customer", () => {
    const model = toCustomerViewProps({ ...customerRidgeline, openBalance: { cents: 60000, invoices: 2 } });
    const markup = renderToStaticMarkup(createElement(CustomerView, { model, detail: { invoicesHref: invoicesHref(CUSTOMER, "unpaid") } }));
    expect(markup).toContain("Open balance");
    expect(markup).toContain(`href="/invoices?customerId=${CUSTOMER}&amp;status=unpaid"`);
    const hidden = renderToStaticMarkup(createElement(CustomerView, { model: toCustomerViewProps({ ...customerRidgeline, openBalance: undefined }), detail: {} }));
    expect(hidden).not.toContain("Open balance");
  });

  it("the live page reads every unpaid page for Admin and Sales only", () => {
    const src = readFileSync("app/(app)/customers/[id]/page.tsx", "utf8");
    expect(src).toMatch(/status: "unpaid"/);
    expect(src).toMatch(/nextCursor/);
    expect(src).toMatch(/canWrite \? unpaidInvoices/);
  });
});

describe("the Invoices register's customer filter", () => {
  it("keeps the customer on every Show choice", () => {
    expect(invoiceStatusOptions(true, CUSTOMER).map(option => option.href)).toEqual([
      `/invoices?customerId=${CUSTOMER}`,
      `/invoices?customerId=${CUSTOMER}&status=unpaid`,
    ]);
  });

  it("names the customer with a Clear back to every customer", () => {
    const markup = renderToStaticMarkup(createElement(InvoicesView, { rows: [], status: "unpaid", customer: { name: "Ridgeline", clearHref: invoicesHref(undefined, "unpaid") } }));
    expect(markup).toContain("Ridgeline");
    expect(markup).toContain(`href="/invoices?status=unpaid"`);
    expect(markup).toContain("No unpaid invoices for Ridgeline");
  });

  it("the live register passes the customer to list_invoices, not the page", () => {
    const src = readFileSync("app/(app)/invoices/page.tsx", "utf8");
    expect(src).toMatch(/runCommand\("list_invoices", \{ cursor, status, customerId \}/);
  });
});
