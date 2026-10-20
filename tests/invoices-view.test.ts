import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InvoicesView } from "../components/mgr/views/invoices";
import { QboStaffInvoiceLinkView } from "../components/mgr/views/accounting";
import { toInvoiceListRow, type InvoiceListRecord } from "../lib/mgr/invoices-view";

const invoice: InvoiceListRecord = { id: "actual", invoice_no: 1042, kind: "invoice", due_on: "2026-09-12", paid_at: null, qbo_sync_status: "pushed", qbo_sync_error: null, qbo_remote_state: "live", qbo_balance_cents: 0, qbo_cash_collected_cents: 0, qbo_accountant_drift: false, written_off_at: null, subtotal_cents: 98000, total_cents: 104000, has_pending_qbo_push: false, customers: { name: "Actual customer" } };

it("keeps structured identity, money, payment, and accounting facts separate", () => {
  const row = toInvoiceListRow(invoice, ["admin"], true, "America/New_York");
  expect(row.document.number).toBe("INV-1042");
  expect(row.document.kind).toBe("invoice");
  expect(row.customer).toBe("Actual customer");
  expect(row.total.cents).toBe(104000);
  expect(row.balance.cents).toBe(0);
  expect(row.balance.value).toBe("$0.00");
  expect(row.payment).toBe("Settled / no cash payment recorded");
  expect(row.accounting).toBeNull();
  expect(row.localSubtotal).toBeNull();
  expect(toInvoiceListRow({ ...invoice, customers: null }, ["admin"], true, "America/New_York").customer).toBe("Customer unavailable");
  const credit = toInvoiceListRow({ ...invoice, kind: "credit_memo", invoice_no: 12, total_cents: -18000, due_on: null, qbo_balance_cents: null }, ["admin"], true, "America/New_York");
  expect(credit.document).toEqual({ number: "CM-0012", kind: "credit_memo" });
  expect(credit.total.cents).toBe(-18000);
  expect(credit.balance.cents).toBeNull();
  expect(credit.balance.value).not.toBe(row.balance.value);
  expect(credit.payment).toBe("Credit memo");
  expect(credit.due.day).toBeNull();
});

it("preserves current totals, credit settlement, and voided invoices without inventing payment or URLs", () => {
  expect(toInvoiceListRow(invoice, ["admin"], true, "America/New_York").href).toBeUndefined();
  const drift = toInvoiceListRow({ ...invoice, qbo_accountant_drift: true }, ["admin"], true, "America/New_York");
  expect(drift.localSubtotal?.cents).toBe(98000);
  expect(drift.total.cents).toBe(104000);
  expect(drift.accounting).toMatch(/review/i);
  const voided = toInvoiceListRow({ ...invoice, paid_at: "2026-09-01", qbo_remote_state: "voided" }, ["admin"], false, "America/New_York");
  expect(voided.payment).toBe("Not paid");
  expect(voided.accounting).toMatch(/voided/i);
  expect(voided.quickbooksHref).toBeNull();
});

it("separates failed accounting pushes from unverified payment evidence", () => {
  const failed = { ...invoice, qbo_sync_status: "push_failed" as const, qbo_sync_error: "QuickBooks rejected the invoice", qbo_balance_cents: null };
  const row = toInvoiceListRow(failed, ["admin"], true, "America/New_York");
  expect(row.needsMapping).toBe(true);
  expect(row.payment).toBe("Payment unverified");
  expect(row.balance.cents).toBeNull();
  expect(row.accounting).toContain(failed.qbo_sync_error);
  expect(toInvoiceListRow(failed, ["sales"], true, "America/New_York").needsMapping).toBe(true);
  expect(toInvoiceListRow(failed, ["admin"], false, "America/New_York").needsMapping).toBe(false);
  expect(toInvoiceListRow(failed, ["warehouse"], true, "America/New_York").needsMapping).toBe(false);
  expect(toInvoiceListRow(failed, ["warehouse", "sales"], true, "America/New_York").needsMapping).toBe(true);
  const deleted = toInvoiceListRow({ ...invoice, qbo_remote_state: "deleted" }, ["admin"], true, "America/New_York");
  expect(deleted.payment).toBe("Payment status unavailable");
  expect(deleted.accounting).toMatch(/deleted/i);
  expect(deleted.needsMapping).toBe(false);
});

it("preserves unknown push outcomes and exact-request recovery while disconnected", () => {
  const pending = { ...invoice, qbo_sync_status: "pending" as const, has_pending_qbo_push: true, qbo_balance_cents: null };
  const connected = toInvoiceListRow(pending, ["warehouse", "sales"], true, "UTC");
  const disconnected = toInvoiceListRow(pending, ["warehouse", "sales"], false, "UTC");
  expect(connected.accounting).toMatch(/unknown.*same request/i);
  expect(disconnected.accounting).toMatch(/unknown.*reconnect.*exact saved request/i);
  expect(disconnected.needsMapping).toBe(false);
  expect(disconnected.balance.cents).toBeNull();
  expect(disconnected.payment).not.toBe("Paid");
  expect(toInvoiceListRow(pending, ["warehouse"], false, "UTC").accounting).not.toMatch(/retry|request/i);
});

it("offers an existing verified QuickBooks link to the union of Admin and Sales roles", () => {
  const link = { href: "https://app.qbo.intuit.com/app/invoice?txnId=7&companyId=9341", reason: null };
  const edited = { ...invoice, qbo_accountant_drift: true, quickbooks_link: link };
  expect(toInvoiceListRow(edited, ["admin"], true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow(edited, ["sales"], true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow(edited, ["warehouse", "sales"], true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow(edited, ["warehouse", "brewer"], true, "UTC").quickbooksHref).toBeNull();
  expect(toInvoiceListRow({ ...edited, qbo_accountant_drift: false }, ["admin"], true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow({ ...edited, quickbooks_link: { href: null, reason: "The remote invoice identity is unavailable." } }, ["admin"], true, "UTC").quickbooksHref).toBeNull();
});

it("keeps payment meanings distinct without treating a legacy marker or zero balance as cash evidence", () => {
  const paid = { ...invoice, paid_at: "2026-09-12T00:30:00Z", qbo_cash_collected_cents: 104000 };
  expect(toInvoiceListRow(paid, ["admin"], true, "UTC").payment).toBe("Paid");
  expect(toInvoiceListRow({ ...paid, qbo_accountant_drift: true }, ["admin"], true, "UTC").payment).toBe("Paid");
  expect(toInvoiceListRow(paid, ["warehouse"], true, "UTC").payment).toBe("Paid");
  expect(toInvoiceListRow({ ...paid, qbo_cash_collected_cents: 50000 }, ["admin"], true, "UTC").payment).toBe("Settled / $500.00 cash received");
  expect(toInvoiceListRow({ ...paid, qbo_cash_collected_cents: 0 }, ["admin"], true, "UTC").payment).toBe("Settled / no cash payment recorded");
  expect(toInvoiceListRow({ ...invoice, qbo_cash_collected_cents: 50000, qbo_balance_cents: 54000 }, ["admin"], true, "UTC").payment).toBe("Partial payment");
  expect(toInvoiceListRow({ ...invoice, qbo_balance_cents: 104000 }, ["admin"], true, "UTC").payment).toBe("Balance due");
  expect(toInvoiceListRow({ ...invoice, qbo_balance_cents: -100 }, ["admin"], true, "UTC").payment).toBe("Credit balance");
  expect(toInvoiceListRow({ ...paid, qbo_balance_cents: -100 }, ["admin"], true, "UTC").payment).toBe("Credit balance");
  expect(toInvoiceListRow({ ...invoice, written_off_at: "2026-09-12" }, ["admin"], true, "UTC").payment).toBe("Written off");
  expect(toInvoiceListRow({ ...invoice, qbo_balance_cents: null }, ["admin"], true, "UTC").payment).toBe("Payment status unavailable");
});

it("formats the date-only due day without a timezone conversion", () => {
  const unpaid = toInvoiceListRow({ ...invoice, qbo_balance_cents: 104000 }, ["admin"], true, "America/New_York", new Date("2026-09-01T12:00:00Z"));
  expect(unpaid.due.day).toBe("2026-09-12");
  expect(unpaid.due.value).toBe("Sep 12, 2026");
  expect(unpaid.overdue).toBe(false);
});

it("marks outstanding invoices overdue only after the brewery-local due day", () => {
  const now = new Date("2026-09-13T02:00:00Z");
  const owed = { ...invoice, qbo_balance_cents: 104000 };
  expect(toInvoiceListRow(owed, ["admin"], true, "UTC", now).overdue).toBe(true);
  expect(toInvoiceListRow(owed, ["admin"], true, "America/New_York", now).overdue).toBe(false);
  for (const change of [{ qbo_balance_cents: 0 }, { qbo_balance_cents: -100 }, { paid_at: "2026-09-12", qbo_balance_cents: 0 }, { written_off_at: "2026-09-12" }, { qbo_remote_state: "voided" as const }, { qbo_remote_state: "deleted" as const }, { kind: "credit_memo" as const }, { due_on: null }]) {
    expect(toInvoiceListRow({ ...owed, ...change }, ["admin"], true, "UTC", now).overdue).toBe(false);
  }
});

it("#1025 does not mark an unknown balance overdue: a failed push says Payment unverified only", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const failed = toInvoiceListRow({ ...invoice, qbo_sync_status: "push_failed", qbo_sync_error: "rejected", qbo_balance_cents: null }, ["admin"], true, "UTC", now);
  expect(failed.payment).toBe("Payment unverified");
  expect(failed.overdue).toBe(false);
  expect(toInvoiceListRow({ ...invoice, qbo_balance_cents: null }, ["admin"], true, "UTC", now).overdue).toBe(false);
});

it("#1025 draws an ordinary row without an accounting caption, QuickBooks as a secondary action, and no dead link", () => {
  const ordinary = toInvoiceListRow(invoice, ["admin"], true, "UTC");
  const linked = { ...toInvoiceListRow({ ...invoice, id: "linked", quickbooks_link: { href: "https://app.qbo.intuit.com/app/invoice?txnId=7", reason: null } }, ["admin"], true, "UTC"), href: "/invoices/linked" };
  const html = renderToStaticMarkup(createElement(InvoicesView, { rows: [ordinary, linked], backHref: "/more" }));
  expect(html).not.toContain("No accounting exception");
  expect(html).not.toContain('href="#"');
  expect(html).toContain('href="/invoices/linked"');
  expect(html).toMatch(/<a[^>]*data-variant="outline"[^>]*href="https:\/\/app\.qbo[^"]*"[^>]*>Open in QuickBooks/);
  const detail = renderToStaticMarkup(createElement(QboStaffInvoiceLinkView, { link: { href: "https://app.qbo.intuit.com/x", reason: null } }));
  expect(detail).toContain('data-variant="outline"');
});

it("reads a historical not_synced invoice as paid and not in QuickBooks, with nothing to fix", () => {
  const historical = { ...invoice, qbo_sync_status: "not_synced" as const, paid_at: "2025-08-14T16:00:00Z", due_on: "2025-08-14", qbo_balance_cents: null };
  const row = toInvoiceListRow(historical, ["admin"], true, "America/New_York", new Date("2026-10-15T12:00:00Z"));
  expect(row.accounting).toMatch(/not in QuickBooks/i);
  expect(row.payment).toBe("Paid");
  expect(row.overdue).toBe(false);
  expect(row.needsMapping).toBe(false);
});

it("#1030 starts the Accounting cell at the left edge its header uses", () => {
  const voided = toInvoiceListRow({ ...invoice, qbo_remote_state: "voided" }, ["admin"], false, "UTC");
  const html = renderToStaticMarkup(createElement(InvoicesView, { rows: [voided], backHref: "/more" }));
  expect(html).toMatch(/<th[^>]*class="[^"]*text-left[^"]*"[^>]*>Accounting<\/th>/);
  expect(html).not.toContain("items-end");
});
