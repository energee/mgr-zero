import { breweryDate, formatDate } from "@/lib/date-format";
import type { StaffRole } from "@/lib/commands/registry";
import { docNo } from "./doc-no";
import { money } from "./money";
import { invoiceCurrentState } from "./invoice-state";
import { qboInvoicePresentation, type QboStaffInvoiceLink } from "./qbo-ui";

export type InvoiceListRecord = { quickbooks_link?: QboStaffInvoiceLink | null; id: string; invoice_no: number | null; kind: "invoice" | "credit_memo"; due_on: string | null; paid_at: string | null; qbo_sync_status: "pending" | "pushed" | "push_failed" | "not_synced"; qbo_sync_error: string | null; qbo_remote_state: "live" | "voided" | "deleted"; qbo_balance_cents: number | null; qbo_cash_collected_cents: number; qbo_accountant_drift: boolean; written_off_at: string | null; subtotal_cents: number; total_cents: number; has_pending_qbo_push: boolean; customers: { name: string } | null };

/** One register row: each fact separate, so the table and the phone list read the same model. */
export type InvoiceListRow = {
  id: string;
  /** INV-1042 or CM-0012: the row's one link, to invoice detail. */
  number: string;
  /** "Customer unavailable" when the customer could not be read. */
  customer: string;
  /** The current total: QuickBooks' after an accountant edit, else MGR's. */
  total: string;
  /** The frozen local subtotal, only when an accountant edited the invoice in QuickBooks. */
  localSubtotal: string | null;
  /** The due day while an invoice is unpaid; null otherwise. */
  due: string | null;
  overdue: boolean;
  /** Payment and QuickBooks state in words (qboInvoicePresentation), led by "credit memo" for a credit. */
  status: string;
  /** A failed push Admin or Sales can fix: the list's old Review button, said as a state. */
  needsMapping: boolean;
  href?: string;
  /** Open in QuickBooks: a verified link on an accountant-edited row, for Admin and Sales. */
  quickbooksHref: string | null;
};

/** Due dates are date-only; compare them with the brewery-local day. Tests and
 * inventory fixtures pin now so overdue presentation does not drift over time. */
export function toInvoiceListRow(inv: InvoiceListRecord, role: StaffRole, connected: boolean, timeZone: string, now: Date = new Date()): InvoiceListRow {
  const credit = inv.kind === "credit_memo", state = invoiceCurrentState(inv);
  const qbo = qboInvoicePresentation({ kind: inv.kind, role, connected, syncStatus: inv.qbo_sync_status, hasPendingPush: inv.has_pending_qbo_push, syncError: inv.qbo_sync_error, remoteState: inv.qbo_remote_state, balanceCents: inv.qbo_balance_cents, cashCollectedCents: inv.qbo_cash_collected_cents, totalCents: inv.total_cents, accountantDrift: inv.qbo_accountant_drift, writtenOff: Boolean(inv.written_off_at) });
  const due = !credit && state === "unpaid" && inv.due_on ? inv.due_on : null;
  const overdue = due !== null && inv.qbo_balance_cents !== 0 && inv.total_cents > 0 && due < breweryDate(timeZone, now);
  const paid = state === "paid" && !qbo.paidStatusShown ? " · paid" : "";
  const remoteReview = inv.qbo_accountant_drift && (role === "admin" || role === "sales");
  return {
    id: inv.id,
    number: docNo(credit ? "CM" : "INV", inv.invoice_no, credit ? "Credit memo" : "Invoice"),
    customer: inv.customers?.name ?? "Customer unavailable",
    total: money(inv.total_cents),
    localSubtotal: inv.qbo_accountant_drift ? money(inv.subtotal_cents) : null,
    due: due && formatDate(due),
    overdue,
    status: `${credit ? "credit memo · " : ""}${qbo.detail}${paid}`,
    // Re-push and Write off follow a void or a delete, which the status already names.
    needsMapping: qbo.actions.includes("fix_mapping"),
    quickbooksHref: remoteReview ? inv.quickbooks_link?.href ?? null : null,
  };
}
