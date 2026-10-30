import { breweryDate, formatDate } from "@/lib/date-format";
import type { StaffRole } from "@/lib/commands/registry";
import { docNo } from "./doc-no";
import { money } from "./money";
import { invoicePaymentBalanceCents } from "./invoice-view";
import { invoiceBalanceCents, invoiceCurrentState, invoiceLedgerOwnsBalance, type InvoiceCurrentState } from "./invoice-state";
import { qboInvoicePresentation, type QboStaffInvoiceLink } from "./qbo-ui";
import { hasAnyRole } from "./roles";
import type { ScopeOption } from "@/components/mgr/scope-pick";

export type InvoiceListRecord = { quickbooks_link?: QboStaffInvoiceLink | null; id: string; invoice_no: number | null; kind: "invoice" | "credit_memo"; due_on: string | null; paid_at: string | null; qbo_sync_status: "pending" | "pushed" | "push_failed" | "not_synced"; qbo_sync_error: string | null; qbo_remote_state: "live" | "voided" | "deleted"; qbo_balance_cents: number | null; qbo_cash_collected_cents: number; qbo_accountant_drift: boolean; written_off_at: string | null; subtotal_cents: number; total_cents: number; has_pending_qbo_push: boolean; qbo_invoice_id: string | null; local_paid_cents: number; local_credit_cents: number; was_pushed_to_qbo: boolean; customers: { name: string } | null };

/** One register row: source facts stay separate until the shared view renders them. */
export type InvoiceListMoney = {
  cents: number | null;
  value: string;
};

/** list_invoices' `status`: unpaid keeps only invoices still owing money. */
export type InvoiceFilter = "unpaid";

/** /invoices with this customer and status; a filter change starts at the newest page, so no cursor. */
export function invoicesHref(customerId: string | undefined, status: InvoiceFilter | undefined) {
  const query = new URLSearchParams();
  if (customerId) query.set("customerId", customerId);
  if (status) query.set("status", status);
  return `/invoices${query.size ? `?${query}` : ""}`;
}

/** The register's Show choices. Live, each links to /invoices with it, keeping
 *  the customer filter. The inventory's stay inert. */
export function invoiceStatusOptions(linked: boolean, customerId?: string): ScopeOption[] {
  return [
    { value: "all", label: "All invoices", href: linked ? invoicesHref(customerId, undefined) : undefined },
    { value: "unpaid", label: "Unpaid", href: linked ? invoicesHref(customerId, "unpaid") : undefined },
  ];
}

/** What a customer owes: the sum of each list_invoices({ status: "unpaid" })
 *  row's balance by the register's rule (invoiceBalanceCents). cents is null
 *  when any balance is unknown, so the total never reads as $0.00 (#1585). */
export function unpaidBalance(records: InvoiceListRecord[]): { cents: number | null; invoices: number } {
  let cents: number | null = 0;
  for (const inv of records) {
    const balance = invoiceBalanceCents(inv, inv.total_cents);
    cents = cents == null || balance == null ? null : cents + balance;
  }
  return { cents, invoices: records.length };
}

export type InvoiceListRow = {
  id: string;
  document: { number: string; kind: "invoice" | "credit_memo" };
  customer: string;
  total: InvoiceListMoney;
  /** value is null when the balance is unknown: the row says nothing, never $0.00. */
  balance: { cents: number | null; value: string | null };
  localSubtotal: InvoiceListMoney | null;
  due: { day: string | null; value: string };
  overdue: boolean;
  payment: string;
  accounting: string | null;
  needsMapping: boolean;
  href?: string;
  quickbooksHref: string | null;
  /** What Record payment may take, by the invoice page's rule; null when the invoice takes no payment. */
  paymentBalanceCents: number | null;
};

/** A ledger-owned invoice reads its paid state from MGR's payments (#1045). */
function ledgerPaymentFact(inv: InvoiceListRecord, state: InvoiceCurrentState): string {
  const balance = invoiceBalanceCents(inv, inv.total_cents)!;
  if (balance < 0) return "Credit balance";
  if (balance === 0 && inv.local_credit_cents > 0) return "Settled";
  if (inv.total_cents <= 0) return "No payment due";
  if (state === "paid") return "Paid";
  return inv.local_paid_cents > 0 ? "Partially paid" : "Unpaid";
}

function paymentFact(inv: InvoiceListRecord, state: InvoiceCurrentState): string {
  if (inv.kind === "credit_memo") return "Credit memo";
  if (state === "written_off") return "Written off";
  if (state === "voided") return "Not paid";
  if (state === "deleted") return "Payment status unavailable";
  if (state === "paid" && inv.qbo_sync_status === "not_synced") return "Paid";
  if (invoiceLedgerOwnsBalance(inv)) return ledgerPaymentFact(inv, state);
  if (inv.qbo_balance_cents == null) return "Payment status unavailable";
  if (inv.qbo_balance_cents === 0) {
    if (inv.qbo_cash_collected_cents > 0 && inv.qbo_cash_collected_cents >= inv.total_cents) return "Paid";
    return inv.qbo_cash_collected_cents > 0
      ? `Settled / ${money(inv.qbo_cash_collected_cents)} cash received`
      : "Settled / no cash payment recorded";
  }
  if (inv.qbo_balance_cents < 0) return "Credit balance";
  if (inv.qbo_cash_collected_cents > 0) return "Partially paid";
  return "Unpaid";
}

/** The first match wins, so the order is the rule: the document's own state,
 *  then payments recorded in MGR (no QuickBooks detail, so every role sees
 *  them), then the QuickBooks detail only Admin and Sales may read. */
function accountingFact(inv: InvoiceListRecord, state: InvoiceCurrentState, roles: readonly StaffRole[], connected: boolean, hasPendingPush: boolean, qboDetail: string): string | null {
  if (state === "written_off") return "Written off in MGR";
  if (inv.qbo_sync_status === "not_synced") return "Before the books opened";
  if (state === "voided") return "Voided in QuickBooks";
  if (state === "deleted") return "Deleted in QuickBooks";
  // start_qbo_push refuses an invoice with an unvoided MGR payment (#1045).
  if (inv.local_paid_cents > 0) return "Payments recorded in MGR";
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
  const qbo = qboInvoicePresentation({ kind: inv.kind, roles, connected, syncStatus: inv.qbo_sync_status, localPaidCents: inv.local_paid_cents, hasPendingPush: inv.has_pending_qbo_push, syncError: inv.qbo_sync_error, remoteState: inv.qbo_remote_state, balanceCents: inv.qbo_balance_cents, cashCollectedCents: inv.qbo_cash_collected_cents, totalCents: inv.total_cents, accountantDrift: inv.qbo_accountant_drift, writtenOff: Boolean(inv.written_off_at) });
  const dueDay = inv.kind === "invoice" ? inv.due_on : null;
  const balanceCents = invoiceBalanceCents(inv, inv.total_cents);
  return {
    id: inv.id,
    document: { number: docNo(inv.kind === "credit_memo" ? "CM" : "INV", inv.invoice_no, inv.kind === "credit_memo" ? "Credit memo" : "Invoice"), kind: inv.kind },
    customer: inv.customers?.name ?? "Customer unavailable",
    total: { cents: inv.total_cents, value: money(inv.total_cents) },
    balance: { cents: balanceCents, value: balanceCents == null ? null : money(balanceCents) },
    localSubtotal: inv.qbo_accountant_drift ? { cents: inv.subtotal_cents, value: money(inv.subtotal_cents) } : null,
    due: { day: dueDay, value: dueDay ? formatDate(dueDay) : inv.kind === "credit_memo" ? "No payment due" : "Due date unavailable" },
    // An unknown balance is not overdue (#1025): only a known positive balance,
    // from QuickBooks or from MGR's payment ledger (#1045), is owed.
    overdue: dueDay !== null && state === "unpaid" && balanceCents != null && balanceCents > 0 && inv.total_cents > 0 && dueDay < breweryDate(timeZone, now),
    payment: paymentFact(inv, state),
    accounting: accountingFact(inv, state, roles, connected, inv.has_pending_qbo_push, qbo.detail),
    needsMapping: qbo.actions.includes("fix_mapping"),
    quickbooksHref: hasAnyRole(roles, ["admin", "sales"]) ? inv.quickbooks_link?.href ?? null : null,
    paymentBalanceCents: invoicePaymentBalanceCents(inv, inv.total_cents),
  };
}
