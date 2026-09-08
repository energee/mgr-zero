// app/(app)/orders/[id]/page.tsx — Order (screen record): the staff home for
// one order: state and next action, lines with ATP, the event history, and
// the restock flag. The drawing is OrderView (shared with the inventory);
// lifecycle-buttons.tsx holds the status-gated verbs (Submit, Confirm, Adjust,
// Pick, Ship, Cancel). Confirm has its own two-tap review at
// /orders/[id]/confirm, a taproom transfer completes at
// /orders/[id]/complete, and Put back at /orders/[id]/restock. An unknown
// or malformed id renders not-found.tsx.
import { OrderView } from "@/components/mgr/views/order";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toOrderViewProps } from "@/lib/mgr/order-view";
import type { OrderStatus } from "@/lib/mgr/order-status";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { LifecycleButtons } from "./lifecycle-buttons";

type Order = { id: string; order_no: number | null; kind: "wholesale" | "taproom_transfer"; status: OrderStatus; po_number: string | null; requested_ship_date: string | null; note: string | null; needs_restock: boolean; customers: { name: string } | null; ship_tos: { label: string; city: string; state: string } | null };
type OrderLine = { id: string; sku_id: string; qty_ordered: number; qty_picked: number | null; qty_shipped: number | null; unit_price_cents: number; skus: { name: string } | null };
type OrderEvent = { id: string; event: string; actor: string; payload: Record<string, unknown>; created_at: string };
type Atp = { sku_id: string; qty: number };
type SkuRow = { id: string; name: string; brands: { name: string } | null };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ order, lines, events, atp }, skuRows] = (await Promise.all([
    orNotFound(runCommand("get_order", { orderId: id }, ctx)), runCommand("list_skus", {}, ctx),
  ])) as [{ order: Order; lines: OrderLine[]; events: OrderEvent[]; atp: Atp[] }, SkuRow[]];
  const skus = skuRows.map((s) => ({ id: s.id, label: s.brands ? `${s.brands.name} — ${s.name}` : s.name }));
  return (
    <OrderView
      model={toOrderViewProps({ order, lines, events, atp })}
      footer={(
        <LifecycleButtons orderId={order.id} status={order.status}
          lines={lines.map((l) => ({ skuId: l.sku_id, skuName: l.skus?.name ?? l.sku_id, qty: Number(l.qty_ordered) }))} skus={skus}
          pickLines={lines.map((l) => ({ id: l.id, skuName: l.skus?.name ?? l.sku_id, qtyOrdered: Number(l.qty_ordered), qtyPicked: l.qty_picked === null ? null : Number(l.qty_picked) }))} />
      )}
    />
  );
}
