import { breweryDate, formatDate } from "@/lib/date-format";
import type { StaffRole } from "@/lib/commands/registry";
import { docNo } from "./doc-no";
import { money } from "./money";
import { invoiceCurrentState, type InvoiceCurrentState } from "./invoice-state";
import { qboInvoicePresentation, type QboStaffInvoiceLink } from "./qbo-ui";
import { hasAnyRole } from "./roles";

export type InvoiceListRecord = { quickbooks_link?: QboStaffInvoiceLink | null; id: string; invoice_no: number | null; kind: "invoice" | "credit_memo"; due_on: string | null; paid_at: string | null; qbo_sync_status: "pending" | "pushed" | "push_failed" | "not_synced"; qbo_sync_error: string | null; qbo_remote_state: "live" | "voided" | "deleted"; qbo_balance_cents: number | null; qbo_cash_collected_cents: number; qbo_accountant_drift: boolean; written_off_at: string | null; subtotal_cents: number; total_cents: number; has_pending_qbo_push: boolean; customers: { name: string } | null };

/** One register row: source facts stay separate until the shared view renders them. */
export type InvoiceListMoney = {
  cents: number | null;
  value: string;
};

export type InvoiceListRow = {
  id: string;
  document: { number: string; kind: "invoice" | "credit_memo" };
  customer: string;
  total: InvoiceListMoney;
  balance: InvoiceListMoney;
  localSubtotal: InvoiceListMoney | null;
  due: { day: string | null; value: string };
  overdue: boolean;
  payment: string;
  accounting: string | null;
  needsMapping: boolean;
  href?: string;
  quickbooksHref: string | null;
};

function paymentFact(inv: InvoiceListRecord, state: InvoiceCurrentState): string {
  if (inv.kind === "credit_memo") return "Credit memo";
  if (state === "written_off") return "Written off";
  if (state === "voided") return "Not paid";
  if (state === "deleted") return "Payment status unavailable";
  if (state === "paid" && inv.qbo_sync_status === "not_synced") return "Paid";
  if (inv.qbo_sync_status === "push_failed" && inv.qbo_balance_cents == null) return "Payment unverified";
  if (inv.qbo_balance_cents == null) return "Payment status unavailable";
  if (inv.qbo_balance_cents === 0) {
    if (inv.qbo_cash_collected_cents > 0 && inv.qbo_cash_collected_cents >= inv.total_cents) return "Paid";
    return inv.qbo_cash_collected_cents > 0
      ? `Settled / ${money(inv.qbo_cash_collected_cents)} cash received`
      : "Settled / no cash payment recorded";
  }
  if (inv.qbo_balance_cents < 0) return "Credit balance";
  if (inv.qbo_cash_collected_cents > 0) return "Partial payment";
  return "Balance due";
}

function accountingFact(inv: InvoiceListRecord, state: InvoiceCurrentState, roles: readonly StaffRole[], connected: boolean, hasPendingPush: boolean, qboDetail: string): string | null {
  if (state === "written_off") return "Written off in MGR";
  if (inv.qbo_sync_status === "not_synced") return "Not in QuickBooks (before the books opened)";
  if (state === "voided") return "Voided in QuickBooks";
  if (state === "deleted") return "Deleted in QuickBooks";
  if (!hasAnyRole(roles, ["admin", "sales"])) return inv.qbo_sync_status === "pushed" ? "QuickBooks status available to Sales" : "Not pushed";
  if (inv.qbo_accountant_drift) return "Review accounting in QuickBooks";
  if (inv.qbo_sync_status === "push_failed") return qboDetail;
  if (hasPendingPush) return qboDetail;
  if (inv.qbo_sync_status === "pending") return connected ? "Not pushed to QuickBooks" : "QuickBooks connection required";
  return null;
}

/** Due dates are date-only; compare them with the brewery-local day. Tests and
 * inventory fixtures pin now so overdue presentation does not drift over time. */
export function toInvoiceListRow(inv: InvoiceListRecord, roles: readonly StaffRole[], connected: boolean, timeZone: string, now: Date = new Date()): InvoiceListRow {
  const state = invoiceCurrentState(inv);
  const qbo = qboInvoicePresentation({ kind: inv.kind, roles, connected, syncStatus: inv.qbo_sync_status, hasPendingPush: inv.has_pending_qbo_push, syncError: inv.qbo_sync_error, remoteState: inv.qbo_remote_state, balanceCents: inv.qbo_balance_cents, cashCollectedCents: inv.qbo_cash_collected_cents, totalCents: inv.total_cents, accountantDrift: inv.qbo_accountant_drift, writtenOff: Boolean(inv.written_off_at) });
  const dueDay = inv.kind === "invoice" ? inv.due_on : null;
  return {
    id: inv.id,
    document: { number: docNo(inv.kind === "credit_memo" ? "CM" : "INV", inv.invoice_no, inv.kind === "credit_memo" ? "Credit memo" : "Invoice"), kind: inv.kind },
    customer: inv.customers?.name ?? "Customer unavailable",
    total: { cents: inv.total_cents, value: money(inv.total_cents) },
    balance: { cents: inv.qbo_balance_cents, value: inv.qbo_balance_cents == null ? "Unavailable" : money(inv.qbo_balance_cents) },
    localSubtotal: inv.qbo_accountant_drift ? { cents: inv.subtotal_cents, value: money(inv.subtotal_cents) } : null,
    due: { day: dueDay, value: dueDay ? formatDate(dueDay) : inv.kind === "credit_memo" ? "No payment due" : "Due date unavailable" },
    // An unknown balance is not overdue (#1025): only a known positive balance is owed.
    overdue: dueDay !== null && state === "unpaid" && inv.qbo_balance_cents != null && inv.qbo_balance_cents > 0 && inv.total_cents > 0 && dueDay < breweryDate(timeZone, now),
    payment: paymentFact(inv, state),
    accounting: accountingFact(inv, state, roles, connected, inv.has_pending_qbo_push, qbo.detail),
    needsMapping: qbo.actions.includes("fix_mapping"),
    quickbooksHref: hasAnyRole(roles, ["admin", "sales"]) ? inv.quickbooks_link?.href ?? null : null,
  };
}
