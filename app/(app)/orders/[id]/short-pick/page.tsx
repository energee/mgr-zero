import { notFound, redirect } from "next/navigation";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery, requirePagePermission } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import type { ShortPickSnapshot } from "@/lib/mgr/short-pick-view";
import { ShortPickForm } from "../short-pick-form";
import "@/lib/commands/all";

export default async function ShortPickPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ line?: string; qty?: string }> }) {
  const { id } = await params;
  const search = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  requirePagePermission(ctx, "resolve_short_pick", "Short pick");
  const [{ order, lines }, locations] = await Promise.all([
    orNotFound(runPageQuery("get_order", { orderId: id }, ctx)) as Promise<{ order: ShortPickSnapshot["order"] & { status: string }; lines: ShortPickSnapshot["line"][] }>,
    runPageQuery("list_locations", {}, ctx) as Promise<ShortPickSnapshot["locations"]>,
  ]);
  if (order.status !== "confirmed" && order.status !== "picked") redirect(`/orders/${order.id}`);
  const line = lines.find(line => line.id === search.line);
  if (!line) notFound();
  const qty = search.qty === undefined ? Number(line.qty_picked ?? 0) : Number(search.qty);
  if (search.qty === "" || !Number.isFinite(qty) || qty < 0 || qty >= Number(line.qty_ordered)) redirect(`/orders/${order.id}/pick`);
  return <ShortPickForm snapshot={{ order, line: { ...line, qty_picked: qty }, locations, backHref: `/orders/${order.id}/pick` }} />;
}
