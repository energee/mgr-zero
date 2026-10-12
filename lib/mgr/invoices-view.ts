import { breweryDate, formatDate } from "@/lib/date-format";
import type { StaffRole } from "@/lib/commands/registry";
import { docNo } from "./doc-no";
import { money } from "./money";
import { invoiceCurrentState } from "./invoice-state";
import { qboInvoicePresentation, type QboStaffInvoiceLink } from "./qbo-ui";

export type InvoiceListRecord = { quickbooks_link?: QboStaffInvoiceLink | null; id: string; invoice_no: number | null; kind: "invoice" | "credit_memo"; due_on: string | null; paid_at: string | null; qbo_sync_status: "pending" | "pushed" | "push_failed"; qbo_sync_error: string | null; qbo_remote_state: "live" | "voided" | "deleted"; qbo_balance_cents: number | null; qbo_cash_collected_cents: number; qbo_accountant_drift: boolean; written_off_at: string | null; subtotal_cents: number; total_cents: number; has_pending_qbo_push: boolean; customers: { name: string } | null };
export type InvoiceListRow = { id: string; title: string; detail: string; tone: "" | "ok" | "w"; actions: ("Review" | "Re-push" | "Write off")[]; href?: string; remoteReview: boolean; staffLink?: QboStaffInvoiceLink | null };

/** Due dates are date-only; compare them with the brewery-local day. Tests and
 * inventory fixtures pin now so overdue presentation does not drift over time. */
export function toInvoiceListRow(inv: InvoiceListRecord, role: StaffRole, connected: boolean, timeZone: string, now: Date = new Date()): InvoiceListRow {
  const credit = inv.kind === "credit_memo", state = invoiceCurrentState(inv);
  const qbo = qboInvoicePresentation({ kind: inv.kind, role, connected, syncStatus: inv.qbo_sync_status, hasPendingPush: inv.has_pending_qbo_push, syncError: inv.qbo_sync_error, remoteState: inv.qbo_remote_state, balanceCents: inv.qbo_balance_cents, cashCollectedCents: inv.qbo_cash_collected_cents, totalCents: inv.total_cents, accountantDrift: inv.qbo_accountant_drift, writtenOff: Boolean(inv.written_off_at) });
  const overdue = !credit && state === "unpaid" && inv.qbo_balance_cents !== 0 && inv.total_cents > 0
    && Boolean(inv.due_on && inv.due_on < breweryDate(timeZone, now));
  const paid = state === "paid" && !qbo.paidStatusShown ? " · paid" : "";
  return {
    id: inv.id, title: `${docNo(credit ? "CM" : "INV", inv.invoice_no, credit ? "Credit memo" : "Invoice")} · ${inv.customers?.name ?? "Customer unavailable"}`,
    detail: `${credit ? "credit memo · " : ""}${qbo.detail}${paid}${!credit && state === "unpaid" && inv.due_on ? ` · ${overdue ? "overdue" : "due"} ${formatDate(inv.due_on)}` : ""}${inv.qbo_accountant_drift ? ` · local subtotal ${money(inv.subtotal_cents)} · current total` : ""} · ${money(inv.total_cents)}`,
    tone: overdue || state === "voided" || state === "deleted" || inv.qbo_accountant_drift || inv.qbo_sync_status === "push_failed" ? "w" : state === "paid" || state === "written_off" || credit ? "ok" : "",
    actions: [...(qbo.actions.includes("fix_mapping") ? ["Review" as const] : []), ...(qbo.actions.includes("repush") ? ["Re-push" as const] : []), ...(qbo.actions.includes("write_off") ? ["Write off" as const] : [])],
    staffLink: inv.quickbooks_link,
    remoteReview: inv.qbo_accountant_drift && (role === "admin" || role === "sales"),
  };
}
