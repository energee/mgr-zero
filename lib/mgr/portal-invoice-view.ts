// lib/mgr/portal-invoice-view.ts — view-model for one portal invoice. Domain
// comes from portal_invoice (number, total, due/paid, lines, brewery phone).
// Pay vs unavailable vs paid is a presentation prop on the view, not a mode.
import { docNo } from "./doc-no";
import { money } from "./money";

export type PortalInvoiceLineView = {
  key: string;
  item: string;
  qty: string;
  amount: string;
};

export type PortalInvoiceViewModel = {
  backHref?: string;
  title: string;
  total: string;
  due?: string;
  paidOn?: string;
  paid: boolean;
  kind: "invoice" | "credit_memo";
  issued: string;
  status: "Credit" | "Paid" | "Unpaid";
  breweryName: string;
  breweryPhone: string | null;
  lines: PortalInvoiceLineView[];
};

export type PortalInvoiceSnapshot = {
  invoice: {
    id: string;
    invoice_no: number | null;
    kind: "invoice" | "credit_memo";
    issued_on: string;
    due_on: string | null;
    paid_at: string | null;
    total_cents: number;
  };
  lines: {
    id: string;
    kind: string;
    qty: number;
    amount_cents: number;
    description: string | null;
    skus: { name: string } | null;
  }[];
  brewery: { name: string; customer_phone: string | null };
};

function day(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso;
}

/** Map a portal_invoice payload onto PortalInvoiceView. */
export function toPortalInvoiceViewProps({ invoice, lines, brewery }: PortalInvoiceSnapshot): PortalInvoiceViewModel {
  const credit = invoice.kind === "credit_memo";
  return {
    backHref: "/portal/invoices",
    title: docNo(credit ? "CM" : "INV", invoice.invoice_no, credit ? "Credit memo" : "Invoice"),
    total: money(invoice.total_cents),
    due: invoice.due_on ?? undefined,
    paidOn: invoice.paid_at ? day(invoice.paid_at) : undefined,
    paid: !credit && invoice.paid_at !== null,
    kind: invoice.kind,
    issued: invoice.issued_on,
    status: credit ? "Credit" : invoice.paid_at ? "Paid" : "Unpaid",
    breweryName: brewery.name,
    breweryPhone: brewery.customer_phone,
    lines: lines.map((l) => ({
      key: l.id,
      item: l.skus?.name ?? l.description ?? l.kind,
      qty: String(Number(l.qty)),
      amount: money(l.amount_cents),
    })),
  };
}
