import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import type { ReturnSource } from "@/lib/commands/orders";
import "@/lib/commands/all";
import { RefusedReturnForm } from "./return-form";
import { navTitle } from "@/lib/mgr/nav";
import { cache } from "react";

const getReturnData = cache(async function getReturnData(id: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const stop = await orNotFound(runPageQuery("get_delivery_stop", { deliveryId: id }, ctx)) as { invoice: { id: string } | null };
  return { ctx, stop };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getReturnData(id);
  return { title: navTitle("/work/deliveries") };
}

type Outstanding = { order_line_id: string; sku_id: string; sku_name: string; outstanding_qty: number; customer_name: string; invoice_timing: string };
export default async function ReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, stop } = await getReturnData(id);
  const [lines, sources, locations, bins] = await Promise.all([
    runPageQuery("list_refused_returns", { deliveryId: id }, ctx) as Promise<Outstanding[]>,
    runPageQuery("get_invoice_return_sources", { deliveryId: id }, ctx) as Promise<ReturnSource[]>,
    runPageQuery("list_locations", {}, ctx) as Promise<{ id: string; name: string }[]>,
    runPageQuery("list_bins", {}, ctx) as Promise<{ id: string; name: string; location_id: string }[]>,
  ]);
  if (!lines.length) return E.status("No refused beer awaiting check-in", "ok");
  // Refused beer usually returns to where it shipped from; preselect that location when every source agrees.
  const shippedFrom = [...new Set(sources.map((s) => s.location_id))];
  if (lines[0].invoice_timing === "now") return <>{E.hd("Refused beer to check in")}{E.note("This shipment was invoiced at ship. Admin or Sales records Return and credit when the beer physically returns.")}{stop.invoice && E.btn("Return and credit", "p", `/invoices/${stop.invoice.id}/return?refusedDeliveryId=${id}`)}</>;
  return <RefusedReturnForm deliveryId={id} model={{ title: `Check in · ${lines[0].customer_name}`, backHref: `/work/deliveries/${id}`, locationId: shippedFrom.length === 1 ? shippedFrom[0] : "",
    locations: locations.map((l) => ({ value: l.id, label: l.name })), bins: bins.map((b) => ({ value: b.id, label: b.name, locationId: b.location_id })),
    lines: lines.map((l) => ({ id: l.order_line_id, name: l.sku_name, outstanding: Number(l.outstanding_qty), sources: sources.filter((s) => s.sku_id === l.sku_id).map((s) => ({ id: s.id, label: `${s.lots?.code ?? "No lot"} · ${s.bins?.name ?? "Bin"}`, shipped: -Number(s.qty) })) })),
  }} />;
}
