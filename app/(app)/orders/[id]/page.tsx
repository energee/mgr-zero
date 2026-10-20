// app/(app)/orders/[id]/page.tsx — Order (screen record): the staff home for
// one order: state and next action, order details and the before-tax price
// summary, lines with ATP, keg charges, the event history, and the restock
// flag, and (Admin and Sales, shipped only) Cost and margin from
// get_order_cogs. The drawing is OrderView (shared with the inventory);
// lifecycle-buttons.tsx holds the status-gated verbs: LifecycleButtons in the
// header (Submit, Ship or Complete transfer, Record pick, Adjust lines) and
// CancelOrderAction in the bottom row. Draft edits use /orders/[id]/edit. Confirming happens only
// through Review and confirm at /orders/[id]/confirm (#713). Adjust lines is /orders/[id]/adjust;
// a taproom transfer completes at
// /orders/[id]/complete, and Put back at /orders/[id]/restock. An unknown
// or malformed id renders not-found.tsx.
import { canRun } from "@/lib/commands/registry";
import type { OrderCogs } from "@/lib/commands/orders";
import { OrderView } from "@/components/mgr/views/order";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toOrderViewProps, type OrderSnapshot } from "@/lib/mgr/order-view";
import type { OrderStatus } from "@/lib/mgr/order-status";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { CancelOrderAction, LifecycleButtons } from "./lifecycle-buttons";

type Order = { id: string; order_no: number | null; kind: "wholesale" | "taproom_transfer"; status: OrderStatus; po_number: string | null; requested_ship_date: string | null; note: string | null; needs_restock: boolean; pickup: boolean; repick_since: string | null; from_location_id?: string; customers: { name: string } | null; ship_tos: { label: string; country: string; city: string | null; state: string | null } | null };
type OrderLine = { id: string; sku_id: string; qty_ordered: number; qty_picked: number | null; qty_shipped: number | null; unit_price_cents: number; one_way_fee_cents: number | null; short_reason: string | null; skus: { name: string } | null };
type OrderEvent = { id: string; event: string; actor: string; payload: Record<string, unknown>; created_at: string };
type Atp = { sku_id: string; qty: number };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ order, lines, events, atp, deposits }, locations] = (await Promise.all([
    orNotFound(runCommand("get_order", { orderId: id }, ctx)), runCommand("list_locations", {}, ctx),
  ])) as [{ order: Order; lines: OrderLine[]; events: OrderEvent[]; atp: Atp[]; deposits: OrderSnapshot["deposits"] }, { id: string; name: string }[]];
  // Cost and margin are for Admin and Sales (#810); only a shipped order has any.
  const cogs = order.status === "shipped" && canRun(ctx, "get_order_cogs") ? (await runCommand("get_order_cogs", { orderId: id }, ctx)) as OrderCogs : undefined;
  const canSell = canRun(ctx, "confirm_order"), canFulfill = canRun(ctx, "record_pick");
  const model = toOrderViewProps({ order, lines, events, atp, locations, backHref: "/orders", timeZone: brewery.timeZone, cogs, deposits });
  if (!canSell) model.confirmHref = undefined;
  if (!canRun(ctx, "update_draft_order")) model.editHref = undefined;
  if (!canFulfill) model.putBackHref = undefined;
  return (
    <OrderView
      model={model}
      actions={<LifecycleButtons canSell={canSell} canFulfill={canFulfill} transfer={order.kind === "taproom_transfer"} orderId={order.id} status={order.status} />}
      footer={<CancelOrderAction canSell={canSell} orderId={order.id} status={order.status} />}
    />
  );
}
