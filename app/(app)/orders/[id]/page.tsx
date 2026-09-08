// app/(app)/orders/[id]/page.tsx — Order (screen record): the staff home for
// one order: state and next action, lines with ATP, the event history, and
// the restock flag. lifecycle-buttons.tsx holds the status-gated verbs
// (Submit, Confirm, Adjust, Pick, Ship, Cancel); Confirm has its own
// two-tap review at /orders/[id]/confirm, a taproom transfer completes at
// /orders/[id]/complete, and Put back at /orders/[id]/restock. An unknown
// or malformed id renders not-found.tsx.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { docNo } from "@/lib/mgr/doc-no";
import { nextState, type OrderStatus } from "@/lib/mgr/order-status";
import { money } from "@/lib/mgr/money";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { LifecycleButtons } from "./lifecycle-buttons";

type Order = { id: string; order_no: number | null; kind: "wholesale" | "taproom_transfer"; status: OrderStatus; po_number: string | null; requested_ship_date: string | null; note: string | null; needs_restock: boolean; customers: { name: string } | null; ship_tos: { label: string; city: string; state: string } | null };
type OrderLine = { id: string; sku_id: string; qty_ordered: number; qty_picked: number | null; qty_shipped: number | null; unit_price_cents: number; skus: { name: string } | null };
type OrderEvent = { id: string; event: string; actor: string; payload: Record<string, unknown>; created_at: string };
type Atp = { sku_id: string; qty: number };
type SkuRow = { id: string; name: string; brands: { name: string } | null };


function lineChange(entries: unknown, skuNames: Map<string, string>): string {
  if (!entries) return "—";
  const arr = Array.isArray(entries) ? (entries as { sku_id: string; qty: number }[]).map((l) => [l.sku_id, l.qty] as const) : Object.entries(entries as Record<string, number>);
  return arr.map(([skuId, qty]) => `${skuNames.get(skuId) ?? "line"} ${qty}`).join(", ");
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ order, lines, events, atp }, skuRows] = (await Promise.all([
    orNotFound(runCommand("get_order", { orderId: id }, ctx)), runCommand("list_skus", {}, ctx),
  ])) as [{ order: Order; lines: OrderLine[]; events: OrderEvent[]; atp: Atp[] }, SkuRow[]];
  const atpMap = new Map(atp.map((a) => [a.sku_id, Number(a.qty)]));
  const skuNames = new Map(lines.map((l) => [l.sku_id, l.skus?.name ?? "line"]));
  const skus = skuRows.map((s) => ({ id: s.id, label: s.brands ? `${s.brands.name} — ${s.name}` : s.name }));
  const label = docNo("ORD", order.order_no, "Order");
  const where = order.customers ? `${order.customers.name}${order.ship_tos ? ` · ${order.ship_tos.city}, ${order.ship_tos.state}` : ""}` : "Taproom transfer";
  return (
    <>
      {E.back("Orders", label, undefined, "/orders")}
      {E.ttl(where)}
      {E.row("Current state", `${order.status}${order.needs_restock ? " · restock pending" : ""}`, E.status(`Next: ${nextState(order.status, order.needs_restock)}`), order.needs_restock ? "w" : "")}
      {order.status === "picked" && order.needs_restock && E.act("Put back", "attention", `/orders/${order.id}/restock`)}
      {order.status === "submitted" && E.act("Review and confirm", "success", `/orders/${order.id}/confirm`)}
      {order.status === "picked" && order.kind === "taproom_transfer" && E.act("Complete transfer", "success", `/orders/${order.id}/complete`)}
      {order.ship_tos && E.fld("Ship-to", order.ship_tos.label)}
      {order.po_number && E.fld("Customer PO", order.po_number)}
      {order.requested_ship_date && E.fld("Requested", order.requested_ship_date)}
      {order.note && E.fld("Note", order.note)}
      <LifecycleButtons transfer={order.kind === "taproom_transfer"} orderId={order.id} status={order.status}
        lines={lines.map((l) => ({ skuId: l.sku_id, skuName: l.skus?.name ?? l.sku_id, qty: Number(l.qty_ordered) }))} skus={skus}
        pickLines={lines.map((l) => ({ id: l.id, skuId: l.sku_id, skuName: l.skus?.name ?? l.sku_id, qtyOrdered: Number(l.qty_ordered), qtyPicked: l.qty_picked === null ? null : Number(l.qty_picked) }))} />
      {E.ttl("Lines")}
      {lines.map((l) => {
        const a = atpMap.get(l.sku_id);
        const qtys = [`${l.qty_ordered} ordered`, l.qty_picked !== null && `${l.qty_picked} picked`, l.qty_shipped !== null && `${l.qty_shipped} shipped`].filter(Boolean).join(" · ");
        return <div key={l.id}>{E.row(l.skus?.name ?? "Line", `${qtys} · ${money(l.unit_price_cents)} each`, a === undefined ? "" : `ATP ${a}`, a !== undefined && a < 0 ? "w" : "")}</div>;
      })}
      {E.ttl("History")}
      {events.length === 0 ? E.blank("No events yet") : E.tape(events.map((e) => [
        `${new Date(e.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })} · ${e.event.replace(/_/g, " ")}`,
        e.event === "lines_adjusted" ? `${lineChange(e.payload.before, skuNames)} → ${lineChange(e.payload.lines, skuNames)}${typeof e.payload.reason === "string" ? ` (${e.payload.reason})` : ""}` : typeof e.payload.reason === "string" ? e.payload.reason : "",
      ]))}
    </>
  );
}
