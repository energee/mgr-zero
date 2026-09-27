// app/(app)/orders/[id]/adjust/page.tsx — Adjust lines (screen record): the
// full-page line edit for a confirmed or picked order. Loads the order and the
// SKU options, then hands them to AdjustLinesForm; any other status goes back
// to the order.
import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import { toSkuOption } from "@/lib/order-form-rules";
import { AdjustLinesForm } from "../adjust-lines-form";
import "@/lib/commands/all";

type OrderLine = { sku_id: string; qty_ordered: number; qty_picked: number | null };
type SkuRow = { id: string; name: string; brands: { name: string } | null };

export default async function AdjustLinesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "adjust_order_lines", "Adjust lines");
  const [{ order, lines }, skuRows] = await Promise.all([
    orNotFound(runPageQuery("get_order", { orderId: id }, ctx)) as Promise<{ order: { id: string; order_no: number | null; status: string }; lines: OrderLine[] }>,
    runPageQuery("list_skus", {}, ctx) as Promise<SkuRow[]>,
  ]);
  if (order.status !== "confirmed" && order.status !== "picked") redirect(`/orders/${order.id}`);
  return <AdjustLinesForm orderId={order.id} orderNo={order.order_no} skus={skuRows.map(toSkuOption)}
    currentLines={lines.map(line => ({ skuId: line.sku_id, qty: Number(line.qty_ordered), qtyPicked: line.qty_picked === null ? null : Number(line.qty_picked) }))} />;
}
