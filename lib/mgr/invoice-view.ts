// lib/mgr/invoice-view.ts — view-model for one invoice. get_invoice +
// list_invoice_questions paint the domain; optional mapping rows are
// inventory-only QuickBooks presentation, not a mode flag.
import { docNo } from "./doc-no";
import { money } from "./money";
import { plural } from "./plural";

export type InvoiceLineView = {
  key: string;
  name: string;
  detail: string;
  amount: string;
};

export type InvoiceQuestionView = {
  key: string;
  id: string;
  detail: string;
  answered: boolean;
};

export type InvoiceMappingView = {
  key: string;
  title: string;
  detail: string;
  tone?: "" | "w" | "ok";
};

export type InvoiceViewModel = {
  backHref?: string;
  title: string;
  customer: string;
  summary: string;
  total: string;
  headerTone: "" | "w" | "ok";
  lines: InvoiceLineView[];
  questions: InvoiceQuestionView[];
  mappings?: InvoiceMappingView[];
};

export type InvoiceSnapshot = {
  invoice: {
    id: string;
    invoice_no: number | null;
    kind: "invoice" | "credit_memo";
    issued_on: string;
    due_on: string | null;
    paid_at: string | null;
    customers: { name: string } | null;
  };
  lines: {
    id: string;
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
  /** Inventory-only QuickBooks mapping rows. Live omits these. */
  mappings?: InvoiceMappingView[];
};

/** Map a get_invoice + list_invoice_questions payload onto InvoiceView. */
export function toInvoiceViewProps({ invoice, lines, questions, mappings }: InvoiceSnapshot): InvoiceViewModel {
  const credit = invoice.kind === "credit_memo";
  const total = lines.reduce((sum, l) => sum + l.amount_cents, 0);
  const dueOrIssued = invoice.due_on ? `due ${invoice.due_on}` : `issued ${invoice.issued_on}`;
  const paid = invoice.paid_at ? ` · paid ${new Date(invoice.paid_at).toLocaleDateString()}` : "";
  return {
    backHref: "/invoices",
    title: docNo(credit ? "CM" : "INV", invoice.invoice_no, credit ? "Credit memo" : "Invoice"),
    customer: invoice.customers?.name ?? "—",
    summary: `${dueOrIssued} · ${plural(lines.length, "line")}${paid}`,
    total: money(total),
    headerTone: invoice.paid_at || credit ? "ok" : "",
    lines: lines.map((l) => ({
      key: l.id,
      name: l.skus?.name ?? l.description,
      detail: `${Number(l.qty)} × ${money(l.unit_price_cents)}`,
      amount: money(l.amount_cents),
    })),
    questions: questions.map((q) => ({
      key: q.id,
      id: q.id,
      detail: `“${q.body}” · ${q.customers?.name ?? "buyer"}, ${new Date(q.created_at).toLocaleDateString()}`,
      answered: Boolean(q.answered_at),
    })),
    mappings,
  };
}
