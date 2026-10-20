// lib/mgr/invoice-view.ts — view-model for one invoice, read as a document
// (#977). get_invoice + list_invoice_questions paint the domain; adapters
// supply mapping facts. It also owns the invoice's price summary: subtotals by
// exact line kind, the current total, and the QuickBooks balance and cash.
import { formatDate } from "@/lib/date-format";
import type { PriceSummaryModel } from "@/components/mgr/views/price-summary";
import { docNo } from "./doc-no";
import { money } from "./money";
import { invoiceCurrentState, invoiceCurrentTotalCents, invoiceIsSettledWithoutPayment } from "./invoice-state";

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
  href?: string;
  unavailable?: boolean;
};

export type InvoiceViewModel = {
  backHref?: string;
  title: string;
  customer: string;
  /** The document's state in words, from invoiceCurrentState. */
  state: { label: string; tone: "" | "w" | "ok" };
  /** Issued and Due, each its own fact; a missing due date reads "Not set". */
  facts: { label: string; value: string }[];
  summary: PriceSummaryModel;
  lines: InvoiceLineView[];
  questions: InvoiceQuestionView[];
  mappings?: InvoiceMappingView[];
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
    qbo_remote_state?: "live" | "voided" | "deleted";
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
};

export function invoiceMappingRows(customer: { name: string; qbo_customer_id: string | null; qbo_realm_id: string | null } | null,
  lines: { id: string; kind: string; sku_id: string | null; description: string; skus: { name: string; qbo_item_id: string | null; qbo_realm_id: string | null } | null }[],
  realm: string, depositItemId: string | null | undefined, mappingHref: string, depositHref?: string, oneWayFeeItemId?: string | null): InvoiceMappingView[] {
  // Only the rows that need action: a healthy mapping is not listed.
  const customerMapped = Boolean(customer?.qbo_customer_id && customer.qbo_realm_id === realm);
  const rows: InvoiceMappingView[] = customerMapped ? [] : [{ key: "customer", title: "Customer mapping", detail: "QuickBooks customer is missing", tone: "w", href: customer ? mappingHref : undefined, unavailable: !customer }];
  const seen = new Set<string>();
  for (const line of lines) {
    if (line.kind !== "sku" || (line.skus?.qbo_item_id && line.skus.qbo_realm_id === realm)) continue;
    const key = line.sku_id ?? line.id;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ key, title: line.skus?.name ?? line.description, detail: "QuickBooks item is missing", tone: "w", href: line.sku_id ? mappingHref : undefined, unavailable: !line.sku_id });
  }
  if (!depositItemId && lines.some(line => /keg_deposit/.test(line.kind))) rows.push({ key: "deposit", title: "Keg deposit mapping", detail: "QuickBooks deposit item is missing", tone: "w", href: depositHref, unavailable: !depositHref });
  // The fee item is set beside the deposit item, in Accounting mappings.
  if (!oneWayFeeItemId && lines.some(line => line.kind === "one_way_keg_fee")) rows.push({ key: "one_way_fee", title: "One-way keg fee mapping", detail: "QuickBooks one-way keg fee item is missing", tone: "w", href: depositHref, unavailable: !depositHref });
  return rows;
}

/** Summary rows by exact invoice_lines.kind; any other kind is an adjustment, so the rows still add up. */
const KIND_GROUPS: [label: string, kinds: string[]][] = [
  ["Items", ["sku"]],
  ["Keg deposits", ["keg_deposit", "keg_deposit_refund"]],
  ["One-way keg fees", ["one_way_keg_fee"]],
];
const kindGroup = (kind: string) => KIND_GROUPS.find(([, kinds]) => kinds.includes(kind))?.[0] ?? "Adjustments";

function invoiceState(invoice: InvoiceSnapshot["invoice"]): InvoiceViewModel["state"] {
  if (invoice.kind === "credit_memo") return { label: "Credit memo", tone: "ok" };
  const state = invoiceCurrentState(invoice);
  if (state === "paid") return { label: "Paid", tone: "ok" };
  if (state === "written_off") return { label: "Written off", tone: "ok" };
  if (state === "voided") return { label: "Voided", tone: "w" };
  if (state === "deleted") return { label: "Deleted in QuickBooks", tone: "w" };
  if (invoiceIsSettledWithoutPayment(invoice)) return { label: "Settled", tone: "ok" };
  const partlyPaid = (invoice.qbo_cash_collected_cents ?? 0) > 0 && (invoice.qbo_balance_cents ?? 0) > 0;
  return { label: partlyPaid ? "Partially paid" : "Unpaid", tone: "" };
}

/** The invoice's money: subtotals by kind, one total, then the balance and
 *  cash QuickBooks supplied. The QuickBooks total (zero included) wins over
 *  the local sum. Only the sync's accountant-edit flag makes it "edited": then
 *  the frozen MGR subtotal is labeled beside it. An unedited taxed invoice
 *  differs only by QuickBooks tax, which gets its own row. Only an invoice
 *  still owed shows a balance (a paid one only when QuickBooks supplied it): a
 *  credit memo, voided, deleted or written-off document is not money due. */
function invoiceSummary(invoice: InvoiceSnapshot["invoice"], lines: InvoiceSnapshot["lines"]): PriceSummaryModel {
  const byGroup = new Map<string, number>();
  for (const line of lines) {
    const group = kindGroup(line.kind);
    byGroup.set(group, (byGroup.get(group) ?? 0) + line.amount_cents);
  }
  const rows = [...KIND_GROUPS.map(([label]) => label), "Adjustments"]
    .filter((label) => byGroup.has(label))
    .map((label) => ({ label, value: money(byGroup.get(label)!) }));
  const localCents = lines.reduce((sum, l) => sum + l.amount_cents, 0);
  const totalCents = invoiceCurrentTotalCents(invoice, localCents);
  if (invoice.kind === "credit_memo") {
    return { rows, total: { label: "Credit memo total", value: money(totalCents) }, note: "Credit issued to the customer, not money they owe." };
  }
  const edited = Boolean(invoice.qbo_accountant_drift);
  if (edited) rows.push({ label: "Frozen MGR line subtotal", value: money(localCents) });
  else if (invoice.qbo_tax_cents != null && invoice.qbo_tax_cents > 0) rows.push({ label: "Tax (QuickBooks)", value: money(invoice.qbo_tax_cents) });
  const state = invoiceCurrentState(invoice);
  const cash = invoice.qbo_cash_collected_cents ?? 0;
  const owedOrKnown = state === "unpaid" || (state === "paid" && invoice.qbo_balance_cents != null);
  const settlement = owedOrKnown ? [
    { label: "Outstanding balance", value: invoice.qbo_balance_cents == null ? "Unknown" : money(invoice.qbo_balance_cents), strong: true },
    ...(cash > 0 ? [{ label: "Cash received in QuickBooks", value: money(cash) }] : []),
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

/** Map a get_invoice + list_invoice_questions payload onto InvoiceView. */
export function toInvoiceViewProps({ invoice, lines, questions, mappings, backHref, timeZone }: InvoiceSnapshot): InvoiceViewModel {
  const credit = invoice.kind === "credit_memo";
  return {
    backHref,
    title: docNo(credit ? "CM" : "INV", invoice.invoice_no, credit ? "Credit memo" : "Invoice"),
    customer: invoice.customers?.name ?? "—",
    state: invoiceState(invoice),
    facts: [
      { label: "Issued", value: formatDate(invoice.issued_on) },
      { label: "Due", value: invoice.due_on ? formatDate(invoice.due_on) : "Not set" },
    ],
    summary: invoiceSummary(invoice, lines),
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
    mappings,
  };
}
