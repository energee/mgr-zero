// app/(app)/orders/[id]/confirm/page.tsx — Confirm order (screen record):
// two taps from Today. The lines with ATP, the oversell note when ATP is
// short, then Confirm order or Cancel order (confirm-buttons.tsx). ponytail:
// the registry warning (a brand not registered for the ship-to state) waits
// on Program 9's registry check on confirm, ruled out of scope there.
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand, requirePagePermission } from "@/lib/mgr/page-query";
import { docNo } from "@/lib/mgr/doc-no";
import { orNotFound } from "@/lib/mgr/not-found";
import "@/lib/commands/all";
import { ConfirmButtons } from "./confirm-buttons";

type Order = { id: string; order_no: number | null; status: string; requested_ship_date: string | null; from_location_id: string; customers: { name: string } | null };
type Line = { id: string; sku_id: string; qty_ordered: number; skus: { name: string } | null };

export default async function ConfirmOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "confirm_order");
  const [{ order, lines, atp }, locations] = await Promise.all([
    orNotFound(runCommand("get_order", { orderId: id }, ctx) as Promise<{ order: Order; lines: Line[]; atp: { sku_id: string; qty: number }[] }>),
    runCommand("list_locations", {}, ctx) as Promise<{ id: string; name: string }[]>,
  ]);
  if (order.status !== "submitted") redirect(`/orders/${order.id}`);
  const atpMap = new Map(atp.map((a) => [a.sku_id, Number(a.qty)]));
  const short = lines.filter((l) => (atpMap.get(l.sku_id) ?? 0) < 0);
  return (
    <>
      {E.back("Orders", docNo("ORD", order.order_no, "Order"), undefined, "/orders")}
      {E.ttl(order.customers?.name ?? "Taproom transfer")}
      {E.fld("State", `Submitted${order.requested_ship_date ? ` · ships ${order.requested_ship_date}` : ""}`)}
      {E.fld("Fulfillment source", locations.find((l) => l.id === order.from_location_id)?.name ?? "—")}
      {E.info("Lifecycle: submitted → confirmed → picked → shipped → delivered. Only the valid next action is active.")}
      {lines.map((l) => {
        const a = atpMap.get(l.sku_id);
        return <div key={l.id}>{E.row(l.skus?.name ?? "Line", "", `${l.qty_ordered}${a === undefined ? "" : ` · ATP ${a}`}`, a !== undefined && a < 0 ? "w" : "")}</div>;
      })}
      {short.map((l) => <div key={l.id}>{E.note(`ATP for ${l.skus?.name ?? "a line"} is ${atpMap.get(l.sku_id)}. Confirming oversells; that stays your call.`)}</div>)}
      {E.sp()}
      <ConfirmButtons orderId={order.id} />
    </>
  );
}
