// app/(app)/routes/[id]/page.tsx — one route. Planned: the builder
// (route-form.tsx → save_route, depart_route). Departed: the run (stops with
// delivered times, Resume on the next open stop, route-run.tsx →
// return_route). Returned: read-only with the return time.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { notFound } from "next/navigation";
import { driverLabel, type RouteList } from "../labels";
import { RouteForm } from "../route-form";
import { ReturnRoute } from "../route-run";

const clock = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "");

export default async function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const list = (await runCommand("list_routes", {}, ctx)) as RouteList;
  let route = list.routes.find((r) => r.id === id);
  if (!route) {
    // a returned route is not in the open list; ask for its day
    const { data } = await ctx.db.from("routes").select("delivery_date").eq("id", id).maybeSingle();
    if (!data) notFound();
    route = ((await runCommand("list_routes", { date: data.delivery_date }, ctx)) as RouteList).routes.find((r) => r.id === id);
    if (!route) notFound();
  }
  const title = `${route.name ?? "Route"} · ${route.delivery_date}`;
  if (!route.departed_at) {
    const candidates = [
      ...route.stops.map((s) => ({ id: (s.shipment_id ?? s.stock_transfer_id)!, label: s.label, kind: s.shipment_id ? "shipment" as const : "transfer" as const })),
      ...list.unassigned.shipments.map((d) => ({ ...d, kind: "shipment" as const })),
      ...list.unassigned.transfers.map((d) => ({ ...d, kind: "transfer" as const })),
    ];
    return (
      <>
        {E.back("Deliveries", title, undefined, "/routes")}
        <RouteForm route={route} candidates={candidates} drivers={list.drivers} />
      </>
    );
  }
  const next = route.stops.find((s) => !s.delivered_at);
  const open = route.stops.filter((s) => !s.delivered_at).length;
  return (
    <>
      {E.back("Deliveries", title, undefined, "/routes")}
      {E.fld("Driver · vehicle", [driverLabel(route.driver_user_id), route.vehicle].filter(Boolean).join(" · "))}
      {E.fld("Departed", clock(route.departed_at))}
      {route.stops.map((s) => (
        <div key={s.id}>
          {s.delivered_at
            ? E.row(`Stop ${s.stop_no} · ${s.label}`, `delivered ${clock(s.delivered_at)}`, "done", "ok")
            : E.row(`Stop ${s.stop_no} · ${s.label}`, s.id === next?.id ? "next" : "later", s.id === next?.id ? E.act("Resume", "info", `/work/deliveries/${s.id}`) : "", s.id === next?.id ? "w" : "")}
        </div>
      ))}
      {E.sp()}
      {route.returned_at ? E.status(`Returned ${clock(route.returned_at)}`, "ok") : <ReturnRoute routeId={route.id} open={open} />}
    </>
  );
}
