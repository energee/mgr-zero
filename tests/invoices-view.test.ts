import { expect, it } from "vitest";
import { toInvoiceListRow, type InvoiceListRecord } from "../lib/mgr/invoices-view";

const invoice: InvoiceListRecord = { id: "actual", invoice_no: 1042, kind: "invoice", due_on: "2026-09-12", paid_at: null, qbo_sync_status: "pushed", qbo_sync_error: null, qbo_remote_state: "live", qbo_balance_cents: 0, qbo_cash_collected_cents: 0, qbo_accountant_drift: false, written_off_at: null, subtotal_cents: 98000, total_cents: 104000, has_pending_qbo_push: false, customers: { name: "Actual customer" } };

it("preserves current totals, credit settlement, and voided invoices without inventing payment or URLs", () => {
  const settled = toInvoiceListRow(invoice, "admin", true);
  expect(settled.detail).toContain("no cash payment recorded");
  expect(settled.detail).toContain("$1,040");
  expect(settled.href).toBeUndefined();
  expect(toInvoiceListRow({ ...invoice, qbo_accountant_drift: true }, "admin", true).detail).toContain("local subtotal $980");
  const voided = toInvoiceListRow({ ...invoice, paid_at: "2026-09-01", qbo_remote_state: "voided" }, "admin", false);
  expect(voided.detail).toContain("not paid");
  expect(voided.actions).toContain("Write off");
});

it("preserves role and connection restrictions on deleted-invoice recovery", () => {
  const deleted = { ...invoice, qbo_remote_state: "deleted" as const };
  expect(toInvoiceListRow(deleted, "admin", true).actions).toEqual(["Re-push", "Write off"]);
  expect(toInvoiceListRow(deleted, "sales", false).actions).toEqual([]);
  expect(toInvoiceListRow(deleted, "warehouse", true).actions).toEqual([]);
  expect(toInvoiceListRow({ ...deleted, kind: "credit_memo" }, "admin", true).actions).not.toContain("Write off");
});
