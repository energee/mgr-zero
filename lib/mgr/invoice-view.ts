// lib/mgr/invoice-view.ts — view-model for one invoice, read as a document
// (#977). get_invoice + list_invoice_questions paint the domain; adapters
// supply mapping facts. It also owns the invoice's price summary: subtotals by
// exact line kind, the current total, and the balance and cash, from
// QuickBooks or from the payments recorded in MGR (#1045), and whether the
// invoice takes a payment.
import { formatDate } from "@/lib/date-format";
import type { PriceSummaryModel } from "@/components/mgr/views/price-summary";
import { docNo } from "./doc-no";
import type { PaymentMethod } from "./enums";
import { PAYMENT_METHOD_LABEL } from "./labels";
import { money, toCents } from "./money";
import { isNumber, numberNotationError } from "./quantity-input";
import { submitReason } from "./submit-reason";
import { invoiceBalanceCents, invoiceCurrentState, invoiceCurrentTotalCents, invoiceIsSettledWithoutPayment, invoiceLedgerOwnsBalance } from "./invoice-state";

export type InvoiceLineView = {
  key: string;
  /** The SKU name, or the stored description when the line has no SKU. */
  name: string;
  /** The stored description, when it says more than the SKU name. */
  description?: string;
  qty: string;
  unitPrice: string;
  /** The stored amount_cents, never recomputed from qty × unit price. */
  amount: string;
};

export type InvoiceQuestionView = {
  key: string;
  id: string;
  body: string;
  /** The brewery-local day the buyer asked. */
  askedOn: string;
  answered: boolean;
};

export type InvoiceMappingView = {
  key: string;
  title: string;
  detail: string;
  tone?: "" | "w" | "ok";
  /** The viewer cannot fix it from this invoice: no local record, or a brewery-wide item only Admin maps. */
  unavailable?: boolean;
};

/** One get_invoice payment; void is its invoice_payment_voids row, or null. */
export type InvoicePaymentRecord = { id: string; amount_cents: number; received_on: string; method: PaymentMethod; reference: string | null; void: { reason: string } | null };

export type InvoicePaymentView = {
  key: string;
  id: string;
  amount: string;
  receivedOn: string;
  method: string;
  reference?: string;
  /** Set only on a voided payment. */
  voidReason?: string;
};

export type InvoiceViewModel = {
  backHref?: string;
  title: string;
  customer: string;
  /** The document's state in words, from invoiceCurrentState. */
  state: { label: string; tone: "" | "w" | "ok" };
  /** Issued and Due, each its own fact; a missing due date reads "Not set".
   *  Then the Order it bills, through its shipment, linked on the live page. */
  facts: { label: string; value: string; href?: string }[];
  summary: PriceSummaryModel;
  lines: InvoiceLineView[];
  questions: InvoiceQuestionView[];
  mappings?: InvoiceMappingView[];
  /** Payments recorded in MGR, newest received first, voided ones included. */
  payments: InvoicePaymentView[];
  /** The most a payment may be (the balance) when record_invoice_payment would
   *  accept one, or null when the invoice takes no payment: the same refusals,
   *  said here, not in the page. */
  paymentBalanceCents: number | null;
};

export type InvoiceSnapshot = {
  backHref?: string;
  /** breweries.timezone: question days use the brewery's day, not the UTC prefix (#442). */
  timeZone: string;
  invoice: {
    id: string;
    invoice_no: number | null;
    kind: "invoice" | "credit_memo";
    issued_on: string;
    due_on: string | null;
    paid_at: string | null;
    /** Set once QuickBooks identified the invoice; then QuickBooks owns its balance. */
    qbo_invoice_id: string | null;
    qbo_remote_state?: "live" | "voided" | "deleted";
    /** not_synced: issued before the books opened, so never pushed and never mapped. */
    qbo_sync_status?: "pending" | "pushed" | "push_failed" | "not_synced";
    qbo_balance_cents?: number | null;
    qbo_total_cents?: number | null;
    /** Set by sync when accounting edited the invoice in QuickBooks: the only authority for "edited". */
    qbo_accountant_drift?: boolean;
    /** QuickBooks TotalTax; qbo_total_cents includes it. */
    qbo_tax_cents?: number | null;
    /** Cash QuickBooks recorded against the invoice; credits and write-downs are not cash. */
    qbo_cash_collected_cents?: number;
    written_off_at?: string | null;
    customers: { name: string } | null;
    /** The shipment it bills and that shipment's order; null for a credit memo. */
    shipments?: { orders: { id: string; order_no: number | null } | null } | null;
  };
  lines: {
    id: string;
    /** invoice_lines.kind: sku, keg_deposit, keg_deposit_refund, one_way_keg_fee, adjustment. */
    kind: string;
    qty: number;
    unit_price_cents: number;
    amount_cents: number;
    description: string;
    skus: { name: string } | null;
  }[];
  questions: {
    id: string;
    body: string;
    created_at: string;
    answered_at: string | null;
    customers: { name: string } | null;
  }[];
  /** Mapping facts from the connected company, or fixture equivalents. */
  mappings?: InvoiceMappingView[];
  /** get_invoice's ledger: the payments, a pending or a successful push, and the unvoided sum. */
  payments: InvoicePaymentRecord[];
  hasPendingPush: boolean;
  wasPushedToQbo: boolean;
  localPaidCents: number;
  localCreditCents: number;
};

/** The mappings an invoice still needs in `realm`. The invoice's one Fix mapping action
 *  leads to them (#1515), so a row carries no link of its own. `canMapBrewerywide`:
 *  the viewer is Admin, who alone maps the deposit and one-way fee items. */
export function invoiceMappingRows(customer: { name: string; qbo_customer_id: string | null; qbo_realm_id: string | null } | null,
  lines: { id: string; kind: string; sku_id: string | null; description: string; skus: { name: string; qbo_item_id: string | null; qbo_realm_id: string | null } | null }[],
  realm: string, depositItemId: string | null | undefined, canMapBrewerywide: boolean, oneWayFeeItemId?: string | null): InvoiceMappingView[] {
  // Only the rows that need action: a healthy mapping is not listed.
  const customerMapped = Boolean(customer?.qbo_customer_id && customer.qbo_realm_id === realm);
  const rows: InvoiceMappingView[] = customerMapped ? [] : [{ key: "customer", title: "Customer mapping", detail: "QuickBooks customer is missing", tone: "w", unavailable: !customer }];
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.kind !== "sku" || (line.skus?.qbo_item_id && line.skus.qbo_realm_id === realm)) continue;
    const key = line.sku_id ?? line.id;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ key, title: line.skus?.name ?? line.description, detail: "QuickBooks item is missing", tone: "w", unavailable: !line.sku_id });
  }
  if (!depositItemId && lines.some(line => /keg_deposit/.test(line.kind))) rows.push({ key: "deposit", title: "Keg deposit mapping", detail: "QuickBooks deposit item is missing", tone: "w", unavailable: !canMapBrewerywide });
  // The fee item is set beside the deposit item, in Accounting mappings.
  if (!oneWayFeeItemId && lines.some(line => line.kind === "one_way_keg_fee")) rows.push({ key: "one_way_fee", title: "One-way keg fee mapping", detail: "QuickBooks one-way keg fee item is missing", tone: "w", unavailable: !canMapBrewerywide });
  return rows;
}

/** Summary rows by exact invoice_lines.kind; any other kind is an adjustment, so the rows still add up. */
const KIND_GROUPS: [label: string, kinds: string[]][] = [
  ["Items", ["sku"]],
  ["Keg deposits", ["keg_deposit", "keg_deposit_refund"]],
  ["One-way keg fees", ["one_way_keg_fee"]],
];
const kindGroup = (kind: string) => KIND_GROUPS.find(([, kinds]) => kinds.includes(kind))?.[0] ?? "Adjustments";

/** Renames the snapshot's push, payment and credit facts for invoice-state.ts. */
const toLedgerFacts = ({ invoice, hasPendingPush, wasPushedToQbo, localPaidCents, localCreditCents }: InvoiceSnapshot) => ({
  ...invoice, has_pending_qbo_push: hasPendingPush, was_pushed_to_qbo: wasPushedToQbo, local_paid_cents: localPaidCents, local_credit_cents: localCreditCents,
});

function invoiceState(snapshot: InvoiceSnapshot, totalCents: number): InvoiceViewModel["state"] {
  const { invoice } = snapshot;
  if (invoice.kind === "credit_memo") return { label: "Credit memo", tone: "ok" };
  const state = invoiceCurrentState(invoice);
  if (state === "written_off") return { label: "Written off", tone: "ok" };
  if (state === "voided") return { label: "Voided", tone: "w" };
  if (state === "deleted") return { label: "Deleted in QuickBooks", tone: "w" };
  const facts = toLedgerFacts(snapshot);
  const balance = invoiceBalanceCents(facts, totalCents);
  if (invoiceLedgerOwnsBalance(facts)) {
    if (balance != null && balance < 0) return { label: "Credit balance", tone: "ok" };
    if (snapshot.localCreditCents > 0 && balance === 0) return { label: "Settled", tone: "ok" };
  }
  if (state === "paid") return { label: "Paid", tone: "ok" };
  if (invoiceIsSettledWithoutPayment(invoice)) return { label: "Settled", tone: "ok" };
  // All lines priced at zero: settled, never overdue, and takes no payment.
  if (invoiceLedgerOwnsBalance(facts) && totalCents <= 0) return { label: "No payment due", tone: "ok" };
  // The two sources never both hold money: MGR refuses a payment on a QuickBooks
  // invoice, and start_qbo_push refuses an invoice with payments.
  const partlyPaid = snapshot.localPaidCents > 0
    || ((invoice.qbo_cash_collected_cents ?? 0) > 0 && (invoice.qbo_balance_cents ?? 0) > 0);
  return { label: partlyPaid ? "Partially paid" : "Unpaid", tone: "" };
}

/** The invoice's money: subtotals by kind, one total, then the balance and
 *  cash. The QuickBooks total (zero included) wins over the local sum. Only
 *  the sync's accountant-edit flag makes it "edited": then the frozen MGR
 *  subtotal is labeled beside it. An unedited taxed invoice differs only by
 *  QuickBooks tax, which gets its own row. The balance is invoiceBalanceCents:
 *  MGR's ledger or QuickBooks. Only an invoice still owed shows it (a paid one
 *  only when the balance is known): a credit memo, voided, deleted or
 *  written-off document is not money due. */
function invoiceSummary(snapshot: InvoiceSnapshot, localCents: number, totalCents: number): PriceSummaryModel {
  const { invoice, lines } = snapshot;
  const byGroup = new Map<string, number>();
  for (const line of lines) {
    const group = kindGroup(line.kind);
    byGroup.set(group, (byGroup.get(group) ?? 0) + line.amount_cents);
  }
  const rows = [...KIND_GROUPS.map(([label]) => label), "Adjustments"]
    .filter((label) => byGroup.has(label))
    .map((label) => ({ label, value: money(byGroup.get(label)!) }));
  if (invoice.kind === "credit_memo") {
    return { rows, total: { label: "Credit memo total", value: money(totalCents) }, note: "Credit issued to the customer, not money they owe." };
  }
  const edited = Boolean(invoice.qbo_accountant_drift);
  if (edited) rows.push({ label: "Frozen MGR line subtotal", value: money(localCents) });
  else if (invoice.qbo_tax_cents != null && invoice.qbo_tax_cents > 0) rows.push({ label: "Tax (QuickBooks)", value: money(invoice.qbo_tax_cents) });
  const state = invoiceCurrentState(invoice);
  const cash = invoice.qbo_cash_collected_cents ?? 0;
  const facts = toLedgerFacts(snapshot);
  const balance = invoiceBalanceCents(facts, totalCents);
  const showSettlement = state === "unpaid" || (state === "paid" && balance != null);
  const settlement = showSettlement ? [
    { label: balance != null && balance < 0 ? "Credit balance" : "Outstanding balance", value: balance == null ? "Unknown" : money(Math.abs(balance)), strong: true },
    ...(cash > 0 ? [{ label: "Cash received in QuickBooks", value: money(cash) }] : []),
    ...(snapshot.localPaidCents > 0 ? [{ label: "Paid in MGR", value: money(snapshot.localPaidCents) }] : []),
    ...(invoiceLedgerOwnsBalance(facts) && snapshot.localCreditCents > 0 ? [{ label: "Credited in MGR", value: money(snapshot.localCreditCents) }] : []),
  ] : undefined;
  return {
    rows,
    total: { label: edited ? "Current invoice total" : "Total", value: money(totalCents) },
    note: edited ? "Edited in QuickBooks. The original lines do not change; review the difference in QuickBooks."
      : state === "voided" ? "Voided in QuickBooks. Nothing is owed."
      : invoice.qbo_total_cents != null ? "From QuickBooks." : "Sum of the invoice lines.",
    settlement,
  };
}

/** record_invoice_payment's refusals, mirrored: only a ledger-owned invoice
 *  (no QuickBooks identity, pending push or earlier push) that is not written
 *  off, not paid, and still has money due takes a payment, of at most its
 *  balance. Otherwise null. The invoice page and the Invoices register both
 *  ask here (#1506), so the two never offer Record payment differently. */
export function invoicePaymentBalanceCents(invoice: Parameters<typeof invoiceLedgerOwnsBalance>[0] & { written_off_at?: string | null }, totalCents: number): number | null {
  const balance = invoiceBalanceCents(invoice, totalCents);
  const takes = invoiceLedgerOwnsBalance(invoice) && !invoice.written_off_at && invoice.paid_at == null
    && balance != null && balance > 0;
  return takes ? balance : null;
}

const paymentView = (p: InvoicePaymentRecord): InvoicePaymentView => ({
  key: p.id,
  id: p.id,
  amount: money(p.amount_cents),
  receivedOn: formatDate(p.received_on),
  method: PAYMENT_METHOD_LABEL[p.method],
  ...(p.reference ? { reference: p.reference } : {}),
  ...(p.void ? { voidReason: p.void.reason } : {}),
});

/** The Record payment form's value: dollars and a YYYY-MM-DD day, as typed. */
export type InvoicePaymentValue = { amount: string; receivedOn: string; method: PaymentMethod | ""; reference: string };

/** What is wrong with a typed payment amount, shown under Amount: exponent
 *  notation, or anything but dollars and cents from $0.01 to the balance.
 *  Empty is not an error; the reason names it. */
export function invoicePaymentAmountError(amount: string, balanceCents: number): string | undefined {
  if (amount === "") return undefined;
  const notation = numberNotationError(amount);
  if (notation) return notation;
  const cents = toCents(amount) ?? 0;
  const fits = isNumber(amount) && (amount.trim().split(".")[1]?.length ?? 0) <= 2 && cents > 0 && cents <= balanceCents;
  return fits ? undefined : `Enter an amount from $0.01 to ${money(balanceCents)}, in dollars and cents.`;
}

/** Why Record payment is withheld (#1485), or null when ready: an amount
 *  above $0.00 and at most the balance, a method, and a received day no later
 *  than today; a day before issue is a prepayment. record_invoice_payment
 *  checks the same again. */
export function invoicePaymentReason(value: InvoicePaymentValue, balanceCents: number, today: string): string | null {
  const missing: string[] = [];
  if (value.amount === "" || invoicePaymentAmountError(value.amount, balanceCents)) missing.push(`an amount from $0.01 to ${money(balanceCents)}`);
  if (value.receivedOn === "" || value.receivedOn > today) missing.push("a received day no later than today");
  if (value.method === "") missing.push("a method");
  return submitReason(missing);
}

/** Map a get_invoice + list_invoice_questions payload onto InvoiceView. */
export function toInvoiceViewProps(snapshot: InvoiceSnapshot): InvoiceViewModel {
  const { invoice, lines, questions, mappings, backHref, timeZone } = snapshot;
  const credit = invoice.kind === "credit_memo";
  const localCents = lines.reduce((sum, l) => sum + l.amount_cents, 0);
  const totalCents = invoiceCurrentTotalCents(invoice, localCents);
  const order = invoice.shipments?.orders;
  return {
    backHref,
    title: docNo(credit ? "CM" : "INV", invoice.invoice_no, credit ? "Credit memo" : "Invoice"),
    customer: invoice.customers?.name ?? "—",
    state: invoiceState(snapshot, totalCents),
    facts: [
      { label: "Issued", value: formatDate(invoice.issued_on) },
      { label: "Due", value: invoice.due_on ? formatDate(invoice.due_on) : "Not set" },
      ...(order ? [{ label: "Order", value: docNo("ORD", order.order_no, "Order"), ...(backHref ? { href: `/orders/${order.id}` } : {}) }] : []),
    ],
    summary: invoiceSummary(snapshot, localCents, totalCents),
    lines: lines.map((l) => {
      const name = l.skus?.name ?? l.description;
      return {
        key: l.id,
        name,
        ...(l.description && l.description !== name ? { description: l.description } : {}),
        qty: String(Number(l.qty)),
        unitPrice: money(l.unit_price_cents),
        amount: money(l.amount_cents),
      };
    }),
    questions: questions.map((q) => ({
      key: q.id,
      id: q.id,
      body: q.body,
      askedOn: formatDate(q.created_at, timeZone),
      answered: Boolean(q.answered_at),
    })),
    // The rows serve a push: an unvoided payment blocks it, as in qboInvoicePresentation, and a
    // not_synced invoice (from before the books opened) is never pushed (#1515).
    mappings: snapshot.localPaidCents > 0 || invoice.qbo_sync_status === "not_synced" ? undefined : mappings,
    payments: snapshot.payments.map(paymentView),
    paymentBalanceCents: invoicePaymentBalanceCents(toLedgerFacts(snapshot), totalCents),
  };
}
