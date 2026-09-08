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
import { formatTime } from "@/lib/time-window";
import { driverLabel, type RouteList } from "../labels";
import { RouteForm } from "../route-form";
import { ReturnRoute } from "../route-run";

export default async function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const list = (await runCommand("list_routes", { id }, ctx)) as RouteList;
  const route = list.routes[0];
  if (!route) notFound();
  const title = `${route.name ?? "Route"} · ${route.delivery_date}`;
  if (!route.departed_at) {
    const candidates = [
      ...route.stops.map((s) => ({ id: (s.shipment_id ?? s.stock_transfer_id)!, label: s.label, kind: s.shipment_id ? "shipment" as const : "transfer" as const })),
      ...list.unassigned,
    ];
    return (
      <>
        {E.back("Deliveries", title, undefined, "/routes")}
        <RouteForm route={route} candidates={candidates} drivers={list.drivers} today={list.today} />
      </>
    );
  }
  const openStops = route.stops.filter((s) => !s.delivered_at);
  const next = openStops[0];
  return (
    <>
      {E.back("Deliveries", title, undefined, "/routes")}
      {E.fld("Driver · vehicle", [driverLabel(route.driver_user_id), route.vehicle].filter(Boolean).join(" · "))}
      {E.fld("Departed", formatTime(route.departed_at))}
      {route.stops.map((s) => {
        const isNext = s.id === next?.id;
        return (
          <div key={s.id}>
            {s.delivered_at
              ? E.row(`Stop ${s.stop_no} · ${s.label}`, `delivered ${formatTime(s.delivered_at)}`, "done", "ok")
              : E.row(`Stop ${s.stop_no} · ${s.label}`, isNext ? "next" : "later", isNext ? E.act("Resume", "info", `/work/deliveries/${s.id}`) : "", isNext ? "w" : "")}
          </div>
        );
      })}
      {E.sp()}
      {route.returned_at ? E.status(`Returned ${formatTime(route.returned_at)}`, "ok") : <ReturnRoute routeId={route.id} open={openStops.length} />}
    </>
  );
}
