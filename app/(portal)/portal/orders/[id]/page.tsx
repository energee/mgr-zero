// app/(portal)/portal/orders/[id]/page.tsx — one order: header, line table,
// event timeline (portal_order). Read-only — the portal has no lifecycle
// actions beyond the cart's create+submit. lines_adjusted events are staff
// edits after confirmation, so they're framed from the customer's point of
// view ("The brewery adjusted this order") rather than reusing the staff
// wording in app/(app)/orders/[id]/page.tsx.
import { DirectionIcon } from "@/components/mgr/icon";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type OrderStatus = "draft" | "submitted" | "confirmed" | "picked" | "shipped" | "cancelled";
type Order = {
  id: string;
  order_no: number | null;
  status: OrderStatus;
  po_number: string | null;
  requested_ship_date: string | null;
  note: string | null;
  needs_restock: boolean;
  ship_tos: { label: string; city: string; state: string } | null;
};
type OrderLine = {
  id: string;
  sku_id: string;
  qty_ordered: number;
  qty_picked: number | null;
  qty_shipped: number | null;
  unit_price_cents: number;
  skus: { name: string } | null;
};
type OrderEvent = {
  id: string;
  event: string;
  payload: Record<string, unknown>;
  created_at: string;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function fmtLines(entries: unknown, skuNames: Map<string, string>): string {
  if (!entries) return "—";
  const arr = Array.isArray(entries)
    ? (entries as { sku_id: string; qty: number }[]).map((l) => [l.sku_id, l.qty] as const)
    : Object.entries(entries as Record<string, number>);
  return arr.map(([skuId, qty]) => `${skuNames.get(skuId) ?? skuId.slice(0, 8)}: ${qty}`).join(", ");
}

function EventLine({ event, skuNames }: { event: OrderEvent; skuNames: Map<string, string> }) {
  const time = fmtTime(event.created_at);
  if (event.event === "lines_adjusted") {
    const before = fmtLines(event.payload.before, skuNames);
    const after = fmtLines(event.payload.lines, skuNames);
    const reason = typeof event.payload.reason === "string" ? event.payload.reason : "";
    return (
      <li>
        {time} — The brewery adjusted this order
        <div className="text-muted-foreground">
          {before} <DirectionIcon /> {after}
          {reason ? ` (${reason})` : ""}
        </div>
      </li>
    );
  }
  if (event.event === "cancelled" && typeof event.payload.reason === "string") {
    return (
      <li>
        {time} — Order cancelled
        <div className="text-muted-foreground">{event.payload.reason}</div>
      </li>
    );
  }
  return (
    <li>
      {time} — {event.event.replace(/_/g, " ")}
    </li>
  );
}

export default async function PortalOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const { order, lines, events } = (await runCommand("portal_order", { orderId: id }, ctx)) as {
    order: Order;
    lines: OrderLine[];
    events: OrderEvent[];
  };

  const skuNames = new Map(lines.map((l) => [l.sku_id, l.skus?.name ?? l.sku_id.slice(0, 8)]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">
          Order {order.order_no ?? order.id.slice(0, 8)}
          {order.needs_restock && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-800 align-middle">
              staged — needs restocking
            </span>
          )}
        </h1>
        <div className="text-sm text-muted-foreground">
          {order.status}
          {order.ship_tos ? ` · ${order.ship_tos.label} (${order.ship_tos.city}, ${order.ship_tos.state})` : ""}
          {order.po_number ? ` · PO ${order.po_number}` : ""}
          {order.requested_ship_date ? ` · requested ${order.requested_ship_date}` : ""}
        </div>
        {order.note && <div className="text-sm text-muted-foreground">Note: {order.note}</div>}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Lines</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">SKU</th>
              <th className="py-1 font-normal">Ordered</th>
              <th className="py-1 font-normal">Picked</th>
              <th className="py-1 font-normal">Shipped</th>
              <th className="py-1 font-normal">Price</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-1">{l.skus?.name ?? l.sku_id.slice(0, 8)}</td>
                <td className="py-1">{l.qty_ordered}</td>
                <td className="py-1">{l.qty_picked ?? "—"}</td>
                <td className="py-1">{l.qty_shipped ?? "—"}</td>
                <td className="py-1">${(l.unit_price_cents / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Event timeline</h2>
        {events.length ? (
          <ul className="flex flex-col gap-2 text-sm">
            {events.map((e) => (
              <EventLine key={e.id} event={e} skuNames={skuNames} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No events yet.</p>
        )}
      </section>
    </div>
  );
}
