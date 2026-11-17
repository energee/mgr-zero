// lib/mgr/portal-invoice-view.ts — view-model for one portal invoice. Domain
// comes from portal_invoice (number, total, due/status, lines, brewery phone).
// Pay vs unavailable vs paid is a presentation prop on the view, not a mode.
import { formatDate } from "@/lib/date-format";
import { docNo } from "./doc-no";
import { money } from "./money";
import { invoiceCurrentState, invoiceCurrentTotalCents, invoiceIsSettledWithoutPayment, type InvoiceCurrentState } from "./invoice-state";

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
  payable: boolean;
  kind: "invoice" | "credit_memo";
  issued: string;
  status: "Credit" | "Paid" | "Unpaid" | "Settled" | "Voided" | "Deleted" | "Written off" | "Review";
  breweryName: string;
  breweryPhone: string | null;
  lines: PortalInvoiceLineView[];
};

const STATUS = { unpaid: "Unpaid", paid: "Paid", voided: "Voided", deleted: "Deleted", written_off: "Written off" } as const satisfies Record<InvoiceCurrentState, PortalInvoiceViewModel["status"]>;

/** The one status word a buyer reads for an invoice: the invoice list, the
 *  invoice page and the order page all ask here, so they cannot disagree.
 *  An unpaid invoice an accountant edited in QuickBooks reads Review. */
export function portalInvoiceStatus(invoice: Parameters<typeof invoiceCurrentState>[0] & { kind: "invoice" | "credit_memo"; qbo_accountant_drift?: boolean }): PortalInvoiceViewModel["status"] {
  if (invoice.kind === "credit_memo") return "Credit";
  const state = invoiceCurrentState(invoice);
  if (state === "unpaid" && invoice.qbo_accountant_drift) return "Review";
  return invoiceIsSettledWithoutPayment(invoice) ? "Settled" : STATUS[state];
}

/** Financial state, not payment availability or provider-sync success. */
export const portalInvoiceStatusTone = {
  Paid: "ok",
  Settled: "ok",
  Unpaid: "w",
  Review: "w",
  Voided: "",
  Deleted: "",
  "Written off": "",
  Credit: "",
} as const satisfies Record<PortalInvoiceViewModel["status"], "" | "ok" | "w">;

export type PortalInvoiceSnapshot = {
  backHref?: string;
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
    qbo_accountant_drift?: boolean;
    written_off_at?: string | null;
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

/** Map a portal_invoice payload onto PortalInvoiceView. */
export function toPortalInvoiceViewProps({ invoice, lines, brewery, backHref }: PortalInvoiceSnapshot): PortalInvoiceViewModel {
  const credit = invoice.kind === "credit_memo";
  const status = portalInvoiceStatus(invoice);
  return {
    backHref,
    title: docNo(credit ? "CM" : "INV", invoice.invoice_no, credit ? "Credit memo" : "Invoice"),
    total: money(invoiceCurrentTotalCents(invoice, invoice.total_cents)),
    due: status === "Unpaid" && invoice.due_on ? formatDate(invoice.due_on) : undefined,
    // Legacy paid_at may be an invoice edit or sync confirmation, not settlement.
    paidOn: undefined,
    paid: status === "Paid",
    payable: status === "Unpaid" && typeof invoice.qbo_balance_cents === "number" && invoice.qbo_balance_cents > 0,
    kind: invoice.kind,
    issued: formatDate(invoice.issued_on),
    status,
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
