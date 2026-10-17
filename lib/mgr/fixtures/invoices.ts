// lib/mgr/fixtures/invoices.ts — the Invoices inventory frame: one fictional
// row per state the register distinguishes, and a plain last-success sync.
import { DEMO_TIME_ZONE } from "./settings";
import type { QboSyncStatus } from "../accounting-view";
import { toInvoiceListRow, type InvoiceListRecord } from "../invoices-view";

const invoice: InvoiceListRecord = { id: "invoice", invoice_no: 1042, kind: "invoice", due_on: "2026-09-12", paid_at: null, qbo_sync_status: "pushed", qbo_sync_error: null, qbo_remote_state: "live", qbo_balance_cents: 98000, qbo_cash_collected_cents: 0, qbo_accountant_drift: false, written_off_at: null, subtotal_cents: 98000, total_cents: 98000, has_pending_qbo_push: false, customers: { name: "Ridgeline" } };
export const invoiceList = [
  { ...invoice, due_on: "2026-10-03", total_cents: 94800, subtotal_cents: 94800, qbo_balance_cents: 94800 },
  { ...invoice, id: "edited", invoice_no: 1041, customers: { name: "Al’s Bar" }, qbo_accountant_drift: true, quickbooks_link: { href: "#", reason: null }, total_cents: 104000, qbo_balance_cents: 104000 },
  { ...invoice, id: "voided", invoice_no: 1040, customers: { name: "Teresa’s" }, qbo_remote_state: "voided" as const, total_cents: 0, qbo_balance_cents: 0 },
  { ...invoice, id: "failed", invoice_no: 1039, customers: { name: "Al’s Bar and Kitchen with an intentionally long customer name" }, qbo_sync_status: "push_failed" as const, qbo_sync_error: "QuickBooks rejected this invoice because the required deposit item mapping is missing", total_cents: 54000, qbo_balance_cents: null },
  { ...invoice, id: "pushed", invoice_no: 1038, customers: { name: "Al’s Bar" }, due_on: "2026-10-20" },
  { ...invoice, id: "due-today", invoice_no: 1037, due_on: "2026-10-04", qbo_balance_cents: 98000 },
  { ...invoice, id: "paid", invoice_no: 1036, paid_at: "2026-08-29T12:00:00Z", qbo_balance_cents: 0, qbo_cash_collected_cents: 98000 },
  { ...invoice, id: "deleted", invoice_no: 1035, customers: { name: "Teresa’s" }, qbo_remote_state: "deleted" as const },
  { ...invoice, id: "settled", invoice_no: 1034, qbo_balance_cents: 0 },
  { ...invoice, id: "settled-with-cash", invoice_no: 1031, paid_at: "2026-09-30T12:00:00Z", qbo_balance_cents: 0, qbo_cash_collected_cents: 48000 },
  { ...invoice, id: "unknown-push", invoice_no: 1030, qbo_sync_status: "pending" as const, has_pending_qbo_push: true, qbo_balance_cents: null },
  { ...invoice, id: "partial", invoice_no: 1033, customers: null, due_on: "2026-10-20", qbo_balance_cents: 50000, qbo_cash_collected_cents: 48000 },
  { ...invoice, id: "written-off", invoice_no: 1032, customers: { name: "Teresa’s" }, qbo_remote_state: "deleted" as const, written_off_at: "2026-09-30T15:00:00Z" },
  { ...invoice, id: "historical", invoice_no: 1001, qbo_sync_status: "not_synced" as const, paid_at: "2025-08-14T16:00:00Z", due_on: "2025-08-14", qbo_balance_cents: null },
  { ...invoice, id: "number-unavailable", invoice_no: null, qbo_sync_status: "pending" as const, due_on: null, qbo_balance_cents: null },
  { ...invoice, id: "credit", invoice_no: 12, kind: "credit_memo" as const, total_cents: -18000, subtotal_cents: -18000, due_on: null, qbo_balance_cents: null },
].map(row => toInvoiceListRow(row, ["admin"], true, DEMO_TIME_ZONE, new Date("2026-10-04T12:00:00Z")));

/** The ordinary sync: the latest attempt completed, so only last success shows. */
export const invoicesSync: QboSyncStatus = {
  latest: { at: "Oct 3, 2026, 4:10 PM", operator: "Maria Alvarez", completed: true },
  lastSuccess: { at: "Oct 3, 2026, 4:10 PM", operator: "Maria Alvarez" },
  latestFailure: null,
  retryRequestId: null,
};
