// lib/mgr/portal-order-view.ts — view-model for portal Order detail.
// portal_order (order, lines, events, shipment.invoices) plus buyerStatus.
import { calendarDay } from "./calendar-day";
import { docNo } from "./doc-no";
import { money } from "./money";
import { buyerStatus } from "./order-status";
import { invoiceCurrentState, invoiceCurrentTotalCents, invoiceIsSettledWithoutPayment } from "./invoice-state";

export type PortalOrderLineView = {
  key: string;
  name: string;
  detail: string;
  amount: string;
  warning?: boolean;
};

export type PortalOrderInvoiceView = {
  title: string;
  detail: string;
  amount: string;
  href: string;
  paid: boolean;
};

export type PortalOrderViewModel = {
  backHref?: string;
  title: string;
  status: string;
  shipTo?: string;
  po?: string;
  requested?: string;
  note?: string;
  lines: PortalOrderLineView[];
  adjusted?: string;
  shortageExplanation?: string;
  invoice?: PortalOrderInvoiceView;
  reorder: boolean;
};

export type PortalOrderSnapshot = {
  backHref?: string;
  order: {
    id: string;
    order_no: number | null;
    status: string;
    po_number: string | null;
    requested_ship_date: string | null;
    note: string | null;
    ship_tos: { label: string; city: string; state: string } | null;
  };
  lines: {
    id: string;
    sku_id: string;
    qty_ordered: number;
    qty_shipped: number | null;
    short_reason?: string | null;
    unit_price_cents: number;
    skus: { name: string } | null;
  }[];
  events: {
    id: string;
    event: string;
    payload: Record<string, unknown>;
    created_at: string;
  }[];
  shipment: {
    id: string;
    invoices: {
      id: string;
      invoice_no: number | null;
      kind: "invoice" | "credit_memo";
      paid_at: string | null;
      qbo_remote_state?: "live" | "voided" | "deleted";
      qbo_balance_cents?: number | null;
      qbo_total_cents?: number | null;
      written_off_at?: string | null;
      invoice_lines: { amount_cents: number }[];
    }[];
  } | null;
};

/** Map a portal_order payload onto PortalOrderView. */
export function toPortalOrderViewProps({ order, lines, events, shipment, backHref }: PortalOrderSnapshot): PortalOrderViewModel {
  const invoice = shipment?.invoices.find((v) => v.kind === "invoice");
  const invoiceState = invoice ? invoiceCurrentState(invoice) : null;
  const ship = order.ship_tos;
  const shortLines = lines.filter((line) => line.qty_shipped !== null && Number(line.qty_shipped) < Number(line.qty_ordered));
  const unshipped = shortLines.reduce((sum, line) => sum + Number(line.qty_ordered) - Number(line.qty_shipped), 0);
  const shortReasons = [...new Set(shortLines.map((line) => line.short_reason?.trim()).filter(Boolean))] as string[];
  return {
    backHref,
    title: docNo("ORD", order.order_no, "Order"),
    status: buyerStatus(order.status, order.requested_ship_date),
    shipTo: ship ? `${ship.label} · ${ship.city}, ${ship.state}` : undefined,
    po: order.po_number ?? undefined,
    requested: order.requested_ship_date ?? undefined,
    note: order.note ?? undefined,
    lines: lines.map((l) => {
      const ordered = Number(l.qty_ordered);
      const shipped = l.qty_shipped === null ? null : Number(l.qty_shipped);
      const qty = shipped ?? ordered;
      return {
        key: l.id,
        name: l.skus?.name ?? "Item",
        detail: shipped !== null ? `ordered ${ordered} · shipped ${shipped}` : `ordered ${ordered}`,
        amount: money(Number(l.unit_price_cents) * qty),
        warning: shipped !== null && shipped < ordered,
      };
    }),
    adjusted: events.some((e) => e.event === "lines_adjusted")
      ? "The brewery adjusted this order. Quantities above are what ships."
      : undefined,
    shortageExplanation: shortLines.length
      ? `The brewery shipped less than ordered.${shortReasons.length ? ` Reason: ${shortReasons.join("; ")}.` : " A shortage reason was not recorded."} The unshipped ${unshipped} ${unshipped === 1 ? "unit was" : "units were"} cancelled when this order closed; nothing remains due on this order.`
      : undefined,
    invoice: invoice
      ? {
        title: docNo("INV", invoice.invoice_no, "Invoice"),
        detail: invoiceState === "paid" ? `paid ${calendarDay(invoice.paid_at!)}`
          : invoiceIsSettledWithoutPayment(invoice) ? "settled"
          : invoiceState === "written_off" ? "written off" : invoiceState ?? "unpaid",
        amount: money(invoiceCurrentTotalCents(invoice, invoice.invoice_lines.reduce((n, x) => n + x.amount_cents, 0))),
        href: `/portal/invoices/${invoice.id}`,
        paid: invoiceState === "paid",
      }
      : undefined,
    reorder: order.status === "shipped",
  };
}
