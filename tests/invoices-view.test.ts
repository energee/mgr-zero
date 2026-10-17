import { expect, it } from "vitest";
import { toInvoiceListRow, type InvoiceListRecord } from "../lib/mgr/invoices-view";

const invoice: InvoiceListRecord = { id: "actual", invoice_no: 1042, kind: "invoice", due_on: "2026-09-12", paid_at: null, qbo_sync_status: "pushed", qbo_sync_error: null, qbo_remote_state: "live", qbo_balance_cents: 0, qbo_cash_collected_cents: 0, qbo_accountant_drift: false, written_off_at: null, subtotal_cents: 98000, total_cents: 104000, has_pending_qbo_push: false, customers: { name: "Actual customer" } };

it("keeps the number, customer, total and status as separate facts", () => {
  const row = toInvoiceListRow(invoice, "admin", true, "America/New_York");
  expect(row.number).toBe("INV-1042");
  expect(row.customer).toBe("Actual customer");
  expect(row.total).toBe("$1,040.00");
  expect(row.status).toBe("settled in QuickBooks · no cash payment recorded");
  expect(row.localSubtotal).toBeNull();
  expect(toInvoiceListRow({ ...invoice, customers: null }, "admin", true, "America/New_York").customer).toBe("Customer unavailable");
  const credit = toInvoiceListRow({ ...invoice, kind: "credit_memo", invoice_no: 12, total_cents: -18000, due_on: null, qbo_balance_cents: null }, "admin", true, "America/New_York");
  expect(credit.number).toBe("CM-0012");
  expect(credit.total).toBe("−$180.00");
  expect(credit.status).toMatch(/^credit memo · /);
  expect(credit.due).toBeNull();
});

it("preserves current totals, credit settlement, and voided invoices without inventing payment or URLs", () => {
  expect(toInvoiceListRow(invoice, "admin", true, "America/New_York").href).toBeUndefined();
  const drift = toInvoiceListRow({ ...invoice, qbo_accountant_drift: true }, "admin", true, "America/New_York");
  expect(drift.localSubtotal).toBe("$980.00");
  expect(drift.total).toBe("$1,040.00");
  const voided = toInvoiceListRow({ ...invoice, paid_at: "2026-09-01", qbo_remote_state: "voided" }, "admin", false, "America/New_York");
  expect(voided.status).toContain("not paid");
  expect(voided.quickbooksHref).toBeNull();
});

it("names a failed push's mapping only where Admin or Sales can fix it, and adds no word for recovery verbs", () => {
  const failed = { ...invoice, qbo_sync_status: "push_failed" as const, qbo_sync_error: "QuickBooks rejected the invoice", qbo_balance_cents: null };
  expect(toInvoiceListRow(failed, "admin", true, "America/New_York").needsMapping).toBe(true);
  expect(toInvoiceListRow(failed, "sales", true, "America/New_York").needsMapping).toBe(true);
  expect(toInvoiceListRow(failed, "admin", true, "America/New_York").status).toBe("push failed · QuickBooks rejected the invoice");
  expect(toInvoiceListRow(failed, "admin", false, "America/New_York").needsMapping).toBe(false);
  expect(toInvoiceListRow(failed, "warehouse", true, "America/New_York").needsMapping).toBe(false);
  const deleted = toInvoiceListRow({ ...invoice, qbo_remote_state: "deleted" }, "admin", true, "America/New_York");
  expect(deleted.needsMapping).toBe(false);
  expect(deleted.status).toBe("deleted in QuickBooks");
});

it("offers Open in QuickBooks only on an accountant-edited row with a verified link, for Admin and Sales", () => {
  const link = { href: "https://app.qbo.intuit.com/app/invoice?txnId=7&companyId=9341", reason: null };
  const edited = { ...invoice, qbo_accountant_drift: true, quickbooks_link: link };
  expect(toInvoiceListRow(edited, "admin", true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow(edited, "sales", true, "UTC").quickbooksHref).toBe(link.href);
  expect(toInvoiceListRow(edited, "warehouse", true, "UTC").quickbooksHref).toBeNull();
  expect(toInvoiceListRow({ ...edited, qbo_accountant_drift: false }, "admin", true, "UTC").quickbooksHref).toBeNull();
  expect(toInvoiceListRow({ ...edited, quickbooks_link: { href: null, reason: "The remote invoice identity is unavailable." } }, "admin", true, "UTC").quickbooksHref).toBeNull();
});

it("does not display a legacy confirmation marker as a paid date", () => {
  const row = toInvoiceListRow({ ...invoice, paid_at: "2026-09-12T00:30:00Z", qbo_cash_collected_cents: 104000 }, "admin", true, "UTC");
  expect(row.status).toContain("paid in QuickBooks");
  expect(row.status).not.toMatch(/paid Sep|Sep 11|Sep 12/);
});

it("shows full payment only once while retaining confirmation on other presentations", () => {
  const paid = { ...invoice, paid_at: "2026-09-12T00:30:00Z", qbo_cash_collected_cents: 104000 };
  expect(toInvoiceListRow(paid, "admin", true, "UTC").status).toBe("paid in QuickBooks");
  expect(toInvoiceListRow({ ...paid, qbo_accountant_drift: true }, "admin", true, "UTC").status).toContain("review there · paid");
  expect(toInvoiceListRow(paid, "warehouse", true, "UTC").status).toContain("available to Sales · paid");
  expect(toInvoiceListRow({ ...paid, qbo_cash_collected_cents: 50000 }, "admin", true, "UTC").status).toContain("$500.00 cash received · paid");
});

it("prints an unpaid invoice's due day the way the rest of the app does (#493)", () => {
  const unpaid = toInvoiceListRow({ ...invoice, qbo_balance_cents: 104000 }, "admin", true, "America/New_York", new Date("2026-09-01T12:00:00Z"));
  expect(unpaid.due).toBe("Sep 12, 2026");
  expect(unpaid.overdue).toBe(false);
});

it("marks outstanding invoices overdue only after the brewery-local due day", () => {
  const now = new Date("2026-09-13T02:00:00Z");
  const owed = { ...invoice, qbo_balance_cents: 104000 };
  expect(toInvoiceListRow(owed, "admin", true, "UTC", now).overdue).toBe(true);
  expect(toInvoiceListRow(owed, "admin", true, "UTC", now).due).toBe("Sep 12, 2026");
  expect(toInvoiceListRow(owed, "admin", true, "America/New_York", now).overdue).toBe(false);
  for (const change of [{ qbo_balance_cents: 0 }, { paid_at: "2026-09-12", qbo_balance_cents: 0 }, { written_off_at: "2026-09-12" }, { qbo_remote_state: "voided" as const }, { qbo_remote_state: "deleted" as const }, { kind: "credit_memo" as const }, { due_on: null }]) {
    expect(toInvoiceListRow({ ...owed, ...change }, "admin", true, "UTC", now).overdue).toBe(false);
  }
});

it("reads a historical not_synced invoice as paid and not in QuickBooks, with nothing to fix", () => {
  const historical = { ...invoice, qbo_sync_status: "not_synced" as const, paid_at: "2025-08-14T16:00:00Z", due_on: "2025-08-14", qbo_balance_cents: null };
  const row = toInvoiceListRow(historical, "admin", true, "America/New_York", new Date("2026-10-15T12:00:00Z"));
  expect(row.status).toContain("not in QuickBooks (before the books opened)");
  expect(row.status).toContain("paid");
  expect(row.status).not.toMatch(/overdue|pushed to QuickBooks/);
  expect(row.overdue).toBe(false);
  expect(row.due).toBeNull();
  expect(row.needsMapping).toBe(false);
});
