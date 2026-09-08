// app/(portal)/portal/orders/[id]/page.tsx — Order detail (screen record):
// one order's buyer-facing status, ship-to, lines (ordered vs shipped) and
// the invoice once the brewery has billed (portal_order + portal_invoices).
// Read-only: the portal has no lifecycle actions beyond the cart's
// create+submit. Staff edits after confirmation show as plain adjusted copy.
import { E } from "@/components/mgr/e";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { docNo } from "@/lib/mgr/doc-no";
import { buyerStatus } from "@/lib/mgr/order-status";
import { money } from "@/lib/mgr/money";
import { orNotFound } from "@/lib/mgr/not-found";
import "@/lib/commands/all";

type Order = { id: string; order_no: number | null; status: string; po_number: string | null; requested_ship_date: string | null; note: string | null; ship_tos: { label: string; city: string; state: string } | null };
type OrderLine = { id: string; sku_id: string; qty_ordered: number; qty_shipped: number | null; unit_price_cents: number; skus: { name: string } | null };
type OrderEvent = { id: string; event: string; payload: Record<string, unknown>; created_at: string };
type Shipment = { id: string; invoices: { id: string; invoice_no: number | null; kind: string; paid_at: string | null; invoice_lines: { amount_cents: number }[] }[] };

export default async function PortalOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const { order, lines, events, shipment } = await orNotFound(
    runCommand("portal_order", { orderId: id }, ctx) as Promise<{ order: Order; lines: OrderLine[]; events: OrderEvent[]; shipment: Shipment | null }>,
  );
  const invoice = shipment?.invoices.find((v) => v.kind === "invoice");
  const adjusted = events.some((e) => e.event === "lines_adjusted");
  const status = buyerStatus(order.status, order.requested_ship_date);
  return (
    <>
      {E.back("Orders", docNo("ORD", order.order_no, "Order"), undefined, "/portal/orders")}
      {E.fld("Status", status)}
      {order.ship_tos && E.fld("Ship-to", `${order.ship_tos.label} · ${order.ship_tos.city}, ${order.ship_tos.state}`)}
      {order.po_number && E.fld("Your PO", order.po_number)}
      {order.note && E.fld("Note", order.note)}
      {lines.map((l) => (
        <div key={l.id}>{E.row(l.skus?.name ?? "Item", l.qty_shipped !== null ? `ordered ${l.qty_ordered} · shipped ${l.qty_shipped}` : `ordered ${l.qty_ordered}`, money(l.unit_price_cents * Number(l.qty_shipped ?? l.qty_ordered)), l.qty_shipped !== null && Number(l.qty_shipped) < Number(l.qty_ordered) ? "w" : "")}</div>
      ))}
      {adjusted && E.info("The brewery adjusted this order. Quantities above are what ships.")}
      {invoice && E.row(docNo("INV", invoice.invoice_no, "Invoice"), invoice.paid_at ? `paid ${new Date(invoice.paid_at).toLocaleDateString()}` : "unpaid", E.act(money(invoice.invoice_lines.reduce((n, x) => n + x.amount_cents, 0)), "info", `/portal/invoices/${invoice.id}`), invoice.paid_at ? "ok" : "")}
      {(order.status === "shipped") && E.btn("Reorder", "g", "/portal")}
    </>
  );
}
