export type InvoiceCurrentState = "unpaid" | "paid" | "voided" | "deleted" | "written_off";

export function invoiceCurrentState(invoice: {
  paid_at: string | null;
  qbo_remote_state?: "live" | "voided" | "deleted";
  qbo_balance_cents?: number | null;
  written_off_at?: string | null;
}): InvoiceCurrentState {
  if (invoice.written_off_at) return "written_off";
  if (invoice.qbo_remote_state === "voided") return "voided";
  if (invoice.qbo_remote_state === "deleted") return "deleted";
  return invoice.paid_at && (invoice.qbo_balance_cents == null || invoice.qbo_balance_cents === 0) ? "paid" : "unpaid";
}

export const invoiceIsSettledWithoutPayment = (invoice: Parameters<typeof invoiceCurrentState>[0]) =>
  invoiceCurrentState(invoice) === "unpaid"
  && invoice.qbo_remote_state === "live"
  && invoice.qbo_balance_cents === 0;

/** An invoice can take a credit memo (Return) only while it is still owed or
 *  paid. Written off, voided, or deleted in QuickBooks means nothing is owed,
 *  so crediting it would credit money never collected. create_credit_memo_impl
 *  refuses the same states (#418). */
export const invoiceIsCreditable = (invoice: Parameters<typeof invoiceCurrentState>[0] & { kind: "invoice" | "credit_memo" }) =>
  invoice.kind === "invoice" && ["unpaid", "paid"].includes(invoiceCurrentState(invoice));

/** The facts that decide who owns an invoice's balance. The names are
 *  InvoiceListRecord's, so a register row passes as is. */
type LedgerInvoice = {
  kind: "invoice" | "credit_memo";
  qbo_invoice_id: string | null;
  paid_at: string | null;
  qbo_balance_cents?: number | null;
  has_pending_qbo_push: boolean;
  was_pushed_to_qbo: boolean;
  local_paid_cents: number;
  local_credit_cents: number;
};

/** True when MGR's payment ledger, not QuickBooks, owns this invoice's balance
 *  (#1045, docs/plans/invoice-local-payments.md): an invoice QuickBooks never
 *  identified, with no pending push, never pushed to any company, and not
 *  marked paid outside the ledger, as a historical import is. A closure by
 *  payments or linked credits remains ledger-owned.
 *  record_invoice_payment refuses the same invoices. */
export function invoiceLedgerOwnsBalance(invoice: LedgerInvoice): boolean {
  return invoice.kind === "invoice"
    && invoice.qbo_invoice_id == null
    && !invoice.has_pending_qbo_push
    && !invoice.was_pushed_to_qbo
    && (invoice.paid_at == null || invoice.local_paid_cents > 0 || invoice.local_credit_cents > 0);
}

/** The ledger's signed balance: gross total minus live linked credits and
 *  unvoided payments. Excess credit stays visible instead of becoming zero.
 *  Otherwise QuickBooks owns the balance, which stays null when unknown. */
export function invoiceBalanceCents(invoice: LedgerInvoice, totalCents: number): number | null {
  if (invoiceLedgerOwnsBalance(invoice)) return Math.max(0, totalCents) - invoice.local_credit_cents - invoice.local_paid_cents;
  return invoice.qbo_balance_cents ?? null;
}

export function invoiceCurrentTotalCents(
  invoice: { kind: "invoice" | "credit_memo"; qbo_total_cents?: number | null },
  localTotalCents: number,
) {
  return invoice.kind === "invoice" && invoice.qbo_total_cents != null
    ? invoice.qbo_total_cents
    : localTotalCents;
}
