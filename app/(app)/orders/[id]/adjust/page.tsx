// app/(app)/orders/[id]/adjust/page.tsx — Adjust lines (screen record): the
// full-page line edit for a confirmed or picked order. Loads the order and the
// SKU options, then hands them to AdjustLinesForm; any other status goes back
// to the order.
import { cache } from "react";
import { redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { getOrderPageData } from "../../order-data";
import { toSkuOption } from "@/lib/order-form-rules";
import { AdjustLinesForm } from "../adjust-lines-form";
import type { AdjustLinesSavedLine } from "@/lib/mgr/adjust-lines-view";
import "@/lib/commands/all";
import { navTitle } from "@/lib/mgr/nav";

const getAdjustPageData = cache(async function getAdjustPageData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "adjust_order_lines", "Adjust lines");
  return getOrderPageData(id);
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getAdjustPageData(id);
  return { title: navTitle("/orders") };
}

type SkuRow = { id: string; name: string; brands: { name: string } | null };

export default async function AdjustLinesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, snapshot } = await getAdjustPageData(id);
  const { order, lines } = snapshot as { order: { id: string; order_no: number | null; status: string }; lines: AdjustLinesSavedLine[] };
  const skuRows = await runPageQuery("list_skus", {}, ctx) as SkuRow[];
  if (order.status !== "confirmed" && order.status !== "picked") redirect(`/orders/${order.id}`);
  return <AdjustLinesForm orderId={order.id} orderNo={order.order_no} skus={skuRows.map(toSkuOption)}
    currentLines={lines} />;
}
