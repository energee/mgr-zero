// lib/mgr/portal-invoice-view.ts — view-model for one portal invoice. Domain
// comes from portal_invoice (number, total, due/paid, lines, brewery phone).
// Pay vs unavailable vs paid vs credit is a presentation prop on the view.
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
  issued?: string;
  due?: string;
  paidOn?: string;
  paid: boolean;
  credit: boolean;
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
  backHref?: string;
};

function paidOnDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Date(iso).toLocaleDateString();
}

/** Map a portal_invoice payload onto PortalInvoiceView. */
export function toPortalInvoiceViewProps({ invoice, lines, brewery, backHref }: PortalInvoiceSnapshot): PortalInvoiceViewModel {
  const credit = invoice.kind === "credit_memo";
  return {
    backHref,
    title: docNo(credit ? "CM" : "INV", invoice.invoice_no, credit ? "Credit memo" : "Invoice"),
    total: money(invoice.total_cents),
    issued: invoice.issued_on,
    due: invoice.due_on ?? undefined,
    paidOn: invoice.paid_at ? paidOnDate(invoice.paid_at) : undefined,
    paid: invoice.paid_at !== null,
    credit,
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
