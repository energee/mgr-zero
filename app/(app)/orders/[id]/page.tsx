// app/(app)/orders/[id]/page.tsx — single order: header, line table with
// per-sku ATP badges, event timeline, and lifecycle-buttons.tsx for the
// status-gated actions. Reads through the command registry (get_order,
// list_skus) with a brewery-scoped Ctx. Failures throw to the (app) error
// boundary.
import { DirectionIcon } from "@/components/mgr/icon";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { LifecycleButtons } from "./lifecycle-buttons";

type OrderStatus = "draft" | "submitted" | "confirmed" | "picked" | "shipped" | "cancelled";
type OrderKind = "wholesale" | "taproom_transfer";
type Order = {
  id: string;
  order_no: number | null;
  kind: OrderKind;
  status: OrderStatus;
  po_number: string | null;
  requested_ship_date: string | null;
  note: string | null;
  needs_restock: boolean;
  customers: { name: string } | null;
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
  actor: string;
  payload: Record<string, unknown>;
  created_at: string;
};
type Atp = { sku_id: string; qty: number };
type SkuRow = { id: string; name: string; products: { name: string } | null };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
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
  const actor = event.actor.slice(0, 8);
  if (event.event === "lines_adjusted") {
    const before = fmtLines(event.payload.before, skuNames);
    const after = fmtLines(event.payload.lines, skuNames);
    const reason = typeof event.payload.reason === "string" ? event.payload.reason : "";
    return (
      <li>
        {time} — lines adjusted — {actor}
        <div className="text-muted-foreground">
          {before} <DirectionIcon /> {after} ({reason})
        </div>
      </li>
    );
  }
  if (event.event === "cancelled" && typeof event.payload.reason === "string") {
    return (
      <li>
        {time} — cancelled — {actor}
        <div className="text-muted-foreground">{event.payload.reason}</div>
      </li>
    );
  }
  return (
    <li>
      {time} — {event.event.replace(/_/g, " ")} — {actor}
    </li>
  );
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ order, lines, events, atp }, skuRows] = (await Promise.all([
    runCommand("get_order", { orderId: id }, ctx),
    runCommand("list_skus", {}, ctx),
  ])) as [{ order: Order; lines: OrderLine[]; events: OrderEvent[]; atp: Atp[] }, SkuRow[]];

  const atpMap = new Map(atp.map((a) => [a.sku_id, a.qty]));
  const skuNames = new Map(lines.map((l) => [l.sku_id, l.skus?.name ?? l.sku_id.slice(0, 8)]));
  const skus = skuRows.map((s) => ({ id: s.id, label: s.products ? `${s.products.name} — ${s.name}` : s.name }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
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
            {order.status} · {order.kind}
            {order.customers?.name ? ` · ${order.customers.name}` : ""}
            {order.ship_tos ? ` · ${order.ship_tos.label} (${order.ship_tos.city}, ${order.ship_tos.state})` : ""}
            {order.po_number ? ` · PO ${order.po_number}` : ""}
            {order.requested_ship_date ? ` · requested ${order.requested_ship_date}` : ""}
          </div>
        </div>
        <LifecycleButtons
          orderId={order.id}
          status={order.status}
          lines={lines.map((l) => ({ skuId: l.sku_id, skuName: l.skus?.name ?? l.sku_id, qty: Number(l.qty_ordered) }))}
          skus={skus}
          pickLines={lines.map((l) => ({
            id: l.id,
            skuName: l.skus?.name ?? l.sku_id,
            qtyOrdered: Number(l.qty_ordered),
            qtyPicked: l.qty_picked === null ? null : Number(l.qty_picked),
          }))}
        />
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
              <th className="py-1 font-normal">ATP</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const lineAtp = atpMap.get(l.sku_id);
              return (
                <tr key={l.id} className="border-t">
                  <td className="py-1">{l.skus?.name ?? l.sku_id.slice(0, 8)}</td>
                  <td className="py-1">{l.qty_ordered}</td>
                  <td className="py-1">{l.qty_picked ?? "—"}</td>
                  <td className="py-1">{l.qty_shipped ?? "—"}</td>
                  <td className="py-1">${(l.unit_price_cents / 100).toFixed(2)}</td>
                  <td className="py-1">
                    {lineAtp !== undefined && lineAtp < 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">{lineAtp}</span>
                    ) : (
                      (lineAtp ?? "—")
                    )}
                  </td>
                </tr>
              );
            })}
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
