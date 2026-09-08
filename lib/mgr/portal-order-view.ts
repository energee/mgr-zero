// lib/mgr/portal-order-view.ts — view-model for portal Order detail.
// portal_order (order, lines, events, shipment.invoices) plus buyerStatus.
import { docNo } from "./doc-no";
import { money } from "./money";
import { buyerStatus } from "./order-status";

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
  note?: string;
  lines: PortalOrderLineView[];
  adjusted?: string;
  invoice?: PortalOrderInvoiceView;
  reorder: boolean;
};

export type PortalOrderSnapshot = {
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
      kind: string;
      paid_at: string | null;
      invoice_lines: { amount_cents: number }[];
    }[];
  } | null;
  backHref?: string;
};

function calendarDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return new Date(iso).toLocaleDateString();
  return `${Number(m[2])}/${Number(m[3])}`;
}

/** Map a portal_order payload onto PortalOrderView. */
export function toPortalOrderViewProps({ order, lines, events, shipment, backHref }: PortalOrderSnapshot): PortalOrderViewModel {
  const invoice = shipment?.invoices.find((v) => v.kind === "invoice");
  const ship = order.ship_tos;
  return {
    backHref,
    title: docNo("ORD", order.order_no, "Order"),
    status: buyerStatus(order.status, order.requested_ship_date),
    shipTo: ship ? `${ship.label} · ${ship.city}, ${ship.state}` : undefined,
    po: order.po_number ?? undefined,
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
    invoice: invoice
      ? {
        title: docNo("INV", invoice.invoice_no, "Invoice"),
        detail: invoice.paid_at ? `paid ${calendarDay(invoice.paid_at)}` : "unpaid",
        amount: money(invoice.invoice_lines.reduce((n, x) => n + x.amount_cents, 0)),
        href: `/portal/invoices/${invoice.id}`,
        paid: Boolean(invoice.paid_at),
      }
      : undefined,
    reorder: order.status === "shipped",
  };
}
