// lib/mgr/portal-invoices-view.ts — view-model for portal Invoice history.
// portal_invoices returns the synchronized QBO total and frozen invoice lines.
// The latter remain the fallback for local and not-yet-synchronized records.
import { docNo } from "./doc-no";
import { money } from "./money";
import { invoiceCurrentState, invoiceCurrentTotalCents } from "./invoice-state";

export type PortalInvoicesRowView = {
  key: string;
  title: string;
  detail: string;
  total: string;
  href: string;
  unpaid: boolean;
  tone: "" | "ok";
};

export type PortalInvoicesViewModel = {
  subtitle: string;
  rows: PortalInvoicesRowView[];
  empty?: string;
};

export type PortalInvoicesSnapshot = {
  customerName: string;
  invoices: {
    id: string;
    invoice_no: number | null;
    kind: "invoice" | "credit_memo";
    due_on: string | null;
    paid_at: string | null;
    qbo_remote_state?: "live" | "voided" | "deleted";
    qbo_balance_cents?: number | null;
    qbo_total_cents?: number | null;
    written_off_at?: string | null;
    invoice_lines: { amount_cents: number }[];
  }[];
};

function day(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : iso;
}

function invoiceDetail(inv: PortalInvoicesSnapshot["invoices"][number]): string {
  if (inv.kind === "credit_memo") return "credit";
  const state = invoiceCurrentState(inv);
  if (state === "paid") return `paid ${day(inv.paid_at!)}`;
  if (state !== "unpaid") return state === "written_off" ? "written off" : state;
  return inv.due_on ? `due ${inv.due_on}` : "unpaid";
}

/** Map a portal_invoices payload onto PortalInvoicesView. */
export function toPortalInvoicesViewProps({ customerName, invoices }: PortalInvoicesSnapshot): PortalInvoicesViewModel {
  return {
    subtitle: customerName,
    empty: invoices.length === 0 ? "No invoices yet" : undefined,
    rows: invoices.map((inv) => {
      const credit = inv.kind === "credit_memo";
      const state = invoiceCurrentState(inv);
      const unpaid = !credit && state === "unpaid";
      const total = invoiceCurrentTotalCents(inv, inv.invoice_lines.reduce((sum, l) => sum + l.amount_cents, 0));
      return {
        key: inv.id,
        title: docNo(credit ? "CM" : "INV", inv.invoice_no, credit ? "Credit memo" : "Invoice"),
        detail: invoiceDetail(inv),
        total: money(total),
        href: `/portal/invoices/${inv.id}`,
        unpaid,
        tone: unpaid ? "" : state === "voided" || state === "deleted" ? "" : "ok",
      };
    }),
  };
}
