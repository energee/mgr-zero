// lib/mgr/portal-invoices-view.ts — view-model for portal Invoice history.
// portal_invoices returns the synchronized QBO total and frozen invoice lines.
// The latter remain the fallback for local and not-yet-synchronized records.
import type { EmptyState } from "./empty-state";
import { formatDate } from "@/lib/date-format";
import { docNo } from "./doc-no";
import { money } from "./money";
import { invoiceCurrentTotalCents } from "./invoice-state";
import { portalInvoiceStatus, portalInvoiceStatusTone } from "./portal-invoice-view";

export type PortalInvoicesRowView = {
  key: string;
  title: string;
  detail: string;
  total: string;
  href: string;
  unpaid: boolean;
  tone: "" | "ok" | "w";
};

export type PortalInvoicesViewModel = {
  rows: PortalInvoicesRowView[];
  empty?: EmptyState;
};

export type PortalInvoicesSnapshot = {
  invoices: {
    id: string;
    invoice_no: number | null;
    kind: "invoice" | "credit_memo";
    due_on: string | null;
    paid_at: string | null;
    qbo_remote_state?: "live" | "voided" | "deleted";
    qbo_balance_cents?: number | null;
    qbo_total_cents?: number | null;
    qbo_accountant_drift?: boolean;
    written_off_at?: string | null;
    invoice_lines: { amount_cents: number }[];
  }[];
};

/** Map a portal_invoices payload onto PortalInvoicesView. */
export function toPortalInvoicesViewProps({ invoices }: PortalInvoicesSnapshot): PortalInvoicesViewModel {
  return {
    empty: invoices.length === 0 ? { title: "No invoices yet" } : undefined,
    rows: invoices.map((inv) => {
      const credit = inv.kind === "credit_memo";
      const total = invoiceCurrentTotalCents(inv, inv.invoice_lines.reduce((sum, l) => sum + l.amount_cents, 0));
      const status = portalInvoiceStatus(inv);
      // Review is still owed: it keeps the row's link to the invoice page, which says why.
      const unpaid = status === "Unpaid" || status === "Review";
      return {
        key: inv.id,
        title: docNo(credit ? "CM" : "INV", inv.invoice_no, credit ? "Credit memo" : "Invoice"),
        // The status word in lower case; an unpaid invoice with a due date names the date instead.
        detail: status === "Unpaid" && inv.due_on ? `due ${formatDate(inv.due_on)}` : status.toLowerCase(),
        total: money(total),
        href: `/portal/invoices/${inv.id}`,
        unpaid,
        tone: portalInvoiceStatusTone[status],
      };
    }),
  };
}
