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

export function invoiceCurrentTotalCents(
  invoice: { kind: "invoice" | "credit_memo"; qbo_total_cents?: number | null },
  localTotalCents: number,
) {
  return invoice.kind === "invoice" && invoice.qbo_total_cents != null
    ? invoice.qbo_total_cents
    : localTotalCents;
}
