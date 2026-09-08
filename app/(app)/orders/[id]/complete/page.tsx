// app/(app)/orders/[id]/complete/page.tsx — Complete transfer (screen
// record): finish a picked taproom transfer order with the same ship_order
// call a wholesale order uses, minus the invoice: paired taproom_transfer
// movements leave the source and arrive at the destination. Each line moves
// at its picked quantity (complete-button.tsx).
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { docNo } from "@/lib/mgr/doc-no";
import { orNotFound } from "@/lib/mgr/not-found";
import "@/lib/commands/all";
import { CompleteButton } from "./complete-button";

type Order = { id: string; order_no: number | null; kind: string; status: string; from_location_id: string; to_location_id: string | null };
type Line = { id: string; qty_ordered: number; qty_picked: number | null; skus: { name: string } | null };

export default async function CompleteTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ order, lines }, locations] = await Promise.all([
    orNotFound(runCommand("get_order", { orderId: id }, ctx) as Promise<{ order: Order; lines: Line[] }>),
    runCommand("list_locations", {}, ctx) as Promise<{ id: string; name: string }[]>,
  ]);
  if (order.kind !== "taproom_transfer" || order.status !== "picked") redirect(`/orders/${order.id}`);
  const name = (lid: string | null) => locations.find((l) => l.id === lid)?.name ?? "—";
  const label = docNo("ORD", order.order_no, "Transfer");
  return (
    <>
      {E.back(label, "Complete transfer", undefined, `/orders/${order.id}`)}
      {E.fld("From → to", `${name(order.from_location_id)} → ${name(order.to_location_id)}`)}
      {lines.map((l) => <div key={l.id}>{E.row(l.skus?.name ?? "Line", "move / picked", `${Number(l.qty_picked ?? 0)} / ${Number(l.qty_picked ?? 0)}`, Number(l.qty_picked ?? 0) < Number(l.qty_ordered) ? "w" : "ok")}</div>)}
      {E.info("No invoice: this is an internal move.")}
      {E.sp()}
      <CompleteButton orderId={order.id} ship={lines.map((l) => ({ lineId: l.id, qty: Number(l.qty_picked ?? 0) }))} />
    </>
  );
}
