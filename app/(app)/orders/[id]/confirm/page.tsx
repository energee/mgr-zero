// app/(app)/orders/[id]/confirm/page.tsx — Confirm order (screen record):
// two taps from Today. The lines with ATP, the oversell note when ATP is
// short, then Confirm order or Cancel order (confirm-buttons.tsx). ponytail:
// the registry warning (a brand not registered for the ship-to state) waits
// on Program 9's registry check on confirm, ruled out of scope there.
import { redirect } from "next/navigation";
import { ConfirmOrderView } from "@/components/mgr/views/confirm-order";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand, requirePagePermission } from "@/lib/mgr/page-query";
import { toConfirmOrderViewProps } from "@/lib/mgr/confirm-order-view";
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
  const [{ order, lines, atp, sourceOnHand }, locations] = await Promise.all([
    orNotFound(runCommand("get_order", { orderId: id }, ctx) as Promise<{ order: Order; lines: Line[]; atp: { sku_id: string; qty: number }[]; sourceOnHand: { sku_id: string; qty: number }[] }>),
    runCommand("list_locations", {}, ctx) as Promise<{ id: string; name: string }[]>,
  ]);
  if (order.status !== "submitted") redirect(`/orders/${order.id}`);
  return (
    <ConfirmOrderView
      model={toConfirmOrderViewProps({ order, lines, atp, sourceOnHand, locations, backHref: "/orders" })}
      footer={<ConfirmButtons orderId={order.id} />}
    />
  );
}
