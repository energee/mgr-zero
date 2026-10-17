import { expect, it } from "vitest";
import { toInvoiceListRow, type InvoiceListRecord } from "../lib/mgr/invoices-view";

const invoice: InvoiceListRecord = { id: "actual", invoice_no: 1042, kind: "invoice", due_on: "2026-09-12", paid_at: null, qbo_sync_status: "pushed", qbo_sync_error: null, qbo_remote_state: "live", qbo_balance_cents: 0, qbo_cash_collected_cents: 0, qbo_accountant_drift: false, written_off_at: null, subtotal_cents: 98000, total_cents: 104000, has_pending_qbo_push: false, customers: { name: "Actual customer" } };

it("keeps structured identity, money, payment, and accounting facts separate", () => {
  const row = toInvoiceListRow(invoice, "admin", true, "America/New_York");
  expect(row.document.number).toBe("INV-1042");
  expect(row.document.kind).toBe("invoice");
  expect(row.customer).toBe("Actual customer");
  expect(row.total).toEqual({ label: "Invoice total", cents: 104000, value: "$1,040.00" });
  expect(row.balance).toEqual({ label: "QuickBooks balance", cents: 0, value: "$0.00" });
  expect(row.payment).toBe("Settled / no cash payment recorded");
  expect(row.accounting).toBeNull();
  expect(row.localSubtotal).toBeNull();
  expect(toInvoiceListRow({ ...invoice, customers: null }, "admin", true, "America/New_York").customer).toBe("Customer unavailable");
  const credit = toInvoiceListRow({ ...invoice, kind: "credit_memo", invoice_no: 12, total_cents: -18000, due_on: null, qbo_balance_cents: null }, "admin", true, "America/New_York");
  expect(credit.document.number).toBe("CM-0012");
  expect(credit.total).toEqual({ label: "Credit total", cents: -18000, value: "−$180.00" });
  expect(credit.balance).toEqual({ label: "QuickBooks balance", cents: null, value: "Unavailable" });
  expect(credit.payment).toBe("Credit memo");
  expect(credit.due.value).toBe("No payment due");
});

it("preserves current totals, credit settlement, and voided invoices without inventing payment or URLs", () => {
  expect(toInvoiceListRow(invoice, "admin", true, "America/New_York").href).toBeUndefined();
  const drift = toInvoiceListRow({ ...invoice, qbo_accountant_drift: true }, "admin", true, "America/New_York");
  expect(drift.localSubtotal).toEqual({ label: "Local subtotal", cents: 98000, value: "$980.00" });
  expect(drift.total.value).toBe("$1,040.00");
  expect(drift.accounting).toBe("Review accounting in QuickBooks");
  const voided = toInvoiceListRow({ ...invoice, paid_at: "2026-09-01", qbo_remote_state: "voided" }, "admin", false, "America/New_York");
  expect(voided.payment).toBe("Not paid");
  expect(voided.accounting).toBe("Voided in QuickBooks");
  expect(voided.quickbooksHref).toBeNull();
});

it("separates failed accounting pushes from unverified payment evidence", () => {
  const failed = { ...invoice, qbo_sync_status: "push_failed" as const, qbo_sync_error: "QuickBooks rejected the invoice", qbo_balance_cents: null };
  const row = toInvoiceListRow(failed, "admin", true, "America/New_York");
  expect(row.needsMapping).toBe(true);
  expect(row.payment).toBe("Payment unverified");
  expect(row.balance.value).toBe("Unavailable");
  expect(row.accounting).toBe("Push failed · QuickBooks rejected the invoice");
  expect(toInvoiceListRow(failed, "sales", true, "America/New_York").needsMapping).toBe(true);
  expect(toInvoiceListRow(failed, "admin", false, "America/New_York").needsMapping).toBe(false);
  expect(toInvoiceListRow(failed, "warehouse", true, "America/New_York").needsMapping).toBe(false);
  const deleted = toInvoiceListRow({ ...invoice, qbo_remote_state: "deleted" }, "admin", true, "America/New_York");
  expect(deleted.payment).toBe("Payment status unavailable");
  expect(deleted.accounting).toBe("Deleted in QuickBooks");
  expect(deleted.needsMapping).toBe(false);
});


it("offers an existing verified QuickBooks link to Admin and Sales, including accountant-edited rows", () => {
  const link = { href: "https://app.qbo.intuit.com/app/invoice?txnId=7&companyId=9341", reason: null };
  const edited = { ...invoice, qbo_accountant_drift: true, quickbooks_link: link };
  expect(toInvoiceListRow(edited, "admin", true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow(edited, "sales", true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow(edited, "warehouse", true, "UTC").quickbooksHref).toBeNull();
  expect(toInvoiceListRow({ ...edited, qbo_accountant_drift: false }, "admin", true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow({ ...edited, quickbooks_link: { href: null, reason: "The remote invoice identity is unavailable." } }, "admin", true, "UTC").quickbooksHref).toBeNull();
});

it("does not display a legacy confirmation marker as a paid date", () => {
  const row = toInvoiceListRow({ ...invoice, paid_at: "2026-09-12T00:30:00Z", qbo_cash_collected_cents: 104000 }, "admin", true, "UTC");
  expect(row.payment).toBe("Paid");
  expect(row.payment).not.toMatch(/paid Sep|Sep 11|Sep 12/);
});

it("keeps payment meanings distinct without relying on zero balance alone", () => {
  const paid = { ...invoice, paid_at: "2026-09-12T00:30:00Z", qbo_cash_collected_cents: 104000 };
  expect(toInvoiceListRow(paid, "admin", true, "UTC").payment).toBe("Paid");
  expect(toInvoiceListRow({ ...invoice, qbo_cash_collected_cents: 50000, qbo_balance_cents: 54000 }, "admin", true, "UTC").payment).toBe("Partial payment");
  expect(toInvoiceListRow({ ...invoice, qbo_cash_collected_cents: 0, qbo_balance_cents: 104000 }, "admin", true, "UTC").payment).toBe("Balance due");
  expect(toInvoiceListRow({ ...invoice, qbo_cash_collected_cents: 0, qbo_balance_cents: 0 }, "admin", true, "UTC").payment).toBe("Settled / no cash payment recorded");
  expect(toInvoiceListRow({ ...invoice, written_off_at: "2026-09-12" }, "admin", true, "UTC").payment).toBe("Written off");
});

it("prints an unpaid invoice's due day the way the rest of the app does (#493)", () => {
  const unpaid = toInvoiceListRow({ ...invoice, qbo_balance_cents: 104000 }, "admin", true, "America/New_York", new Date("2026-09-01T12:00:00Z"));
  expect(unpaid.due.value).toBe("Sep 12, 2026");
  expect(unpaid.overdue).toBe(false);
});

it("marks outstanding invoices overdue only after the brewery-local due day", () => {
  const now = new Date("2026-09-13T02:00:00Z");
  const owed = { ...invoice, qbo_balance_cents: 104000 };
  expect(toInvoiceListRow(owed, "admin", true, "UTC", now).overdue).toBe(true);
  expect(toInvoiceListRow(owed, "admin", true, "UTC", now).due.value).toBe("Sep 12, 2026");
  expect(toInvoiceListRow(owed, "admin", true, "America/New_York", now).overdue).toBe(false);
  for (const change of [{ qbo_balance_cents: 0 }, { paid_at: "2026-09-12", qbo_balance_cents: 0 }, { written_off_at: "2026-09-12" }, { qbo_remote_state: "voided" as const }, { qbo_remote_state: "deleted" as const }, { kind: "credit_memo" as const }, { due_on: null }]) {
    expect(toInvoiceListRow({ ...owed, ...change }, "admin", true, "UTC", now).overdue).toBe(false);
  }
});

it("reads a historical not_synced invoice as paid and not in QuickBooks, with nothing to fix", () => {
  const historical = { ...invoice, qbo_sync_status: "not_synced" as const, paid_at: "2025-08-14T16:00:00Z", due_on: "2025-08-14", qbo_balance_cents: null };
  const row = toInvoiceListRow(historical, "admin", true, "America/New_York", new Date("2026-10-15T12:00:00Z"));
  expect(row.accounting).toBe("Not in QuickBooks (before the books opened)");
  expect(row.payment).toBe("Paid");
  expect(row.overdue).toBe(false);
  expect(row.needsMapping).toBe(false);
});
