// app/(app)/orders/[id]/page.tsx — Order (screen record): the staff home for
// one order: state and next action, order details and the before-tax price
// summary, lines with ATP, keg charges, the event history (each entry names
// who made it: staff by saved name or email, a portal buyer by email), and the restock
// flag, and (Admin and Sales, shipped only) Cost and margin from
// get_order_cogs. The drawing is OrderView (shared with the inventory);
// lifecycle-buttons.tsx holds the status-gated verbs: LifecycleButtons in the
// header (Submit, Ship or Complete transfer, Record pick; Put
// back leads instead while beer is staged) and CancelOrderAction in the bottom
// row, both inside OrderActionScope so they share one command action. Draft edits use /orders/[id]/edit. Confirming happens only
// through Review and confirm at /orders/[id]/confirm (#713). Lines change,
// add and remove in place (order-lines-form.tsx, #1503), with list_skus for
// an added line's picker; a taproom transfer completes at
// /orders/[id]/complete, and Put back at /orders/[id]/restock. An unknown
// or malformed id renders not-found.tsx.
import { canRun } from "@/lib/commands/registry";
import type { OrderCogs } from "@/lib/commands/orders";
import type { PortalUser, TeamMember } from "@/lib/commands/invites";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toOrderViewProps, type OrderSnapshot } from "@/lib/mgr/order-view";
import type { DeliveryOutcome, OrderStatus } from "@/lib/mgr/order-status";
import "@/lib/commands/all";
import { getOrderPageData } from "../order-data";
import { CancelOrderAction, LifecycleButtons, OrderActionScope } from "./lifecycle-buttons";
import { OrderLinesForm } from "./order-lines-form";
import { toSkuOption } from "@/lib/order-form-rules";
import { navTitle } from "@/lib/mgr/nav";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getOrderPageData(id);
  return { title: navTitle("/orders") };
}

type Order = { id: string; order_no: number | null; customer_id: string | null; sale_channel_id: string; kind: "wholesale" | "taproom_transfer"; status: OrderStatus; po_number: string | null; requested_ship_date: string | null; note: string | null; needs_restock: boolean; pickup: boolean; repick_since: string | null; from_location_id?: string; customers: { name: string } | null; ship_tos: { label: string; country: string; city: string | null; state: string | null } | null };
type OrderLine = { id: string; sku_id: string; qty_ordered: number; qty_picked: number | null; qty_shipped: number | null; qty_refused: number; unit_price_cents: number; one_way_fee_cents: number | null; short_reason: string | null; skus: { name: string } | null };
type OrderEvent = { id: string; event: string; actor: string; payload: Record<string, unknown>; created_at: string };
type Atp = { sku_id: string; qty: number };
type SkuRow = { id: string; name: string; brands: { name: string } | null };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brewery, ctx, snapshot } = await getOrderPageData(id);
  const { order, lines, events, atp, deposits, shipment } = snapshot as { order: Order; lines: OrderLine[]; events: OrderEvent[]; atp: Atp[]; deposits: OrderSnapshot["deposits"]; shipment: { deliveries: { outcome: DeliveryOutcome | null }[]; invoices: NonNullable<OrderSnapshot["invoice"]>[] } | null };
  const canSell = canRun(ctx, "confirm_order"), canFulfill = canRun(ctx, "record_pick");
  // Lines change in place where adjust_order_lines may run: Admin or Sales, confirmed or picked.
  const editable = canSell && (order.status === "confirmed" || order.status === "picked");
  const [locations, cogs, team, buyers, skuRows, emailStatuses]: [{ id: string; name: string }[], OrderCogs | undefined, TeamMember[], PortalUser[], SkuRow[], OrderSnapshot["emailStatuses"]] = await Promise.all([
    runCommand("list_locations", {}, ctx) as Promise<{ id: string; name: string }[]>,
    // Cost and margin are for Admin and Sales (#810); only a shipped order has any.
    order.status === "shipped" && canRun(ctx, "get_order_cogs") ? runCommand("get_order_cogs", { orderId: id }, ctx) as Promise<OrderCogs> : Promise.resolve(undefined),
    // History names its actors. Portal buyers are named only for roles that may list them (Admin, Sales).
    runCommand("list_team_members", {}, ctx) as Promise<TeamMember[]>,
    order.customer_id && canRun(ctx, "list_customer_users") ? runCommand("list_customer_users", { customerId: order.customer_id }, ctx) as Promise<PortalUser[]> : Promise.resolve([]),
    // An added line picks from the SKUs New order offers: priced on a wholesale order's channel, or any active one for a transfer.
    editable ? runCommand("list_skus", order.kind === "wholesale" ? { saleChannelId: order.sale_channel_id } : { active: true }, ctx) as Promise<SkuRow[]> : Promise.resolve([]),
    order.kind === "wholesale" && canRun(ctx, "get_order_email_status") ? runCommand("get_order_email_status", { orderId: id }, ctx) as Promise<OrderSnapshot["emailStatuses"]> : Promise.resolve(undefined),
  ]);
  const actorNames = Object.fromEntries([...buyers.map((u) => [u.userId, u.email] as const), ...team.map((m) => [m.userId, m.name] as const)]);
  const model = toOrderViewProps({ order, lines, events, atp, locations, deliveryOutcome: shipment?.deliveries[0]?.outcome ?? null, invoice: shipment?.invoices[0] ?? null, backHref: "/orders", timeZone: brewery.timeZone, cogs, deposits, actorNames, emailStatuses });
  if (!canSell) model.confirmHref = undefined;
  if (!canRun(ctx, "update_draft_order")) model.editHref = undefined;
  if (!canFulfill) model.putBackHref = undefined;
  if (!canSell) model.canReorderRefused = false;
  return (
    <OrderActionScope>
      <OrderLinesForm
        orderId={order.id}
        lines={lines}
        editable={editable}
        skus={skuRows.map(toSkuOption)}
        model={model}
        pickup={canRun(ctx, "set_order_pickup") && order.kind === "wholesale" && order.status !== "shipped" && order.status !== "cancelled" ? { value: order.pickup } : undefined}
        actions={<LifecycleButtons canSell={canSell} canFulfill={canFulfill} transfer={order.kind === "taproom_transfer"} restockFirst={model.putBackHref !== undefined} orderId={order.id} status={order.status} />}
        footer={<CancelOrderAction canSell={canSell} orderId={order.id} status={order.status} />}
      />
    </OrderActionScope>
  );
}
