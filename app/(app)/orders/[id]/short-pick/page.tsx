import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { getOrderPageData } from "../../order-data";
import type { ShortPickSnapshot } from "@/lib/mgr/short-pick-view";
import { ShortPickForm } from "../short-pick-form";
import "@/lib/commands/all";
import { navTitle } from "@/lib/mgr/nav";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ line?: string; qty?: string }> };

const getShortPickPageData = cache(async function getShortPickPageData(id: string, lineId?: string, requestedQty?: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "resolve_short_pick", "Short pick");
  const { snapshot } = await getOrderPageData(id);
  const { order, lines } = snapshot as { order: ShortPickSnapshot["order"] & { status: string }; lines: ShortPickSnapshot["line"][] };
  if (order.status !== "confirmed" && order.status !== "picked") redirect(`/orders/${order.id}`);
  const line = lines.find(line => line.id === lineId);
  if (!line) notFound();
  const qty = requestedQty === undefined ? Number(line.qty_picked ?? 0) : Number(requestedQty);
  if (requestedQty === "" || !Number.isFinite(qty) || qty < 0 || qty >= Number(line.qty_ordered)) redirect(`/orders/${order.id}/pick`);
  return { ctx, order, line, qty };
});

export async function generateMetadata({ params, searchParams }: Props) {
  const { id } = await params;
  const search = await searchParams;
  await getShortPickPageData(id, search.line, search.qty);
  return { title: navTitle("/orders") };
}

export default async function ShortPickPage({ params, searchParams }: Props) {
  const { id } = await params;
  const search = await searchParams;
  const { ctx, order, line, qty } = await getShortPickPageData(id, search.line, search.qty);
  const locations = await runPageQuery("list_locations", {}, ctx) as ShortPickSnapshot["locations"];
  return <ShortPickForm snapshot={{ order, line: { ...line, qty_picked: qty }, locations, backHref: `/orders/${order.id}/pick` }} />;
}
