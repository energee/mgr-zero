import { DEMO_TIME_ZONE } from "./settings";
import { toInvoiceListRow, type InvoiceListRecord } from "../invoices-view";

const invoice: InvoiceListRecord = { id: "invoice", invoice_no: 1042, kind: "invoice", due_on: "2026-09-12", paid_at: null, qbo_sync_status: "pushed", qbo_sync_error: null, qbo_remote_state: "live", qbo_balance_cents: 98000, qbo_cash_collected_cents: 0, qbo_accountant_drift: false, written_off_at: null, subtotal_cents: 98000, total_cents: 98000, has_pending_qbo_push: false, customers: { name: "Ridgeline" } };
export const invoiceList = [
  { ...invoice, due_on: "2026-10-03", total_cents: 94800, subtotal_cents: 94800, qbo_balance_cents: 94800 },
  { ...invoice, id: "edited", invoice_no: 1041, customers: { name: "Al’s Bar" }, qbo_accountant_drift: true, total_cents: 104000, qbo_balance_cents: 104000 },
  { ...invoice, id: "voided", invoice_no: 1040, customers: { name: "Teresa’s" }, qbo_remote_state: "voided" as const, total_cents: 0, qbo_balance_cents: 0 },
  { ...invoice, id: "failed", invoice_no: 1039, customers: { name: "Al’s Bar" }, qbo_sync_status: "push_failed" as const, qbo_sync_error: "item unmapped", total_cents: 54000, qbo_balance_cents: null },
  { ...invoice, id: "deleted", invoice_no: 1036, customers: { name: "Teresa’s" }, qbo_remote_state: "deleted" as const },
  { ...invoice, id: "pushed", invoice_no: 1038, customers: { name: "Al’s Bar" } },
  { ...invoice, id: "paid", invoice_no: 1037, paid_at: "2026-08-29T12:00:00Z", qbo_balance_cents: 0, qbo_cash_collected_cents: 98000 },
  { ...invoice, id: "credit", invoice_no: 12, kind: "credit_memo" as const, total_cents: -18000, subtotal_cents: -18000, due_on: null, qbo_balance_cents: null },
].map(row => toInvoiceListRow(row, "admin", true, DEMO_TIME_ZONE));
