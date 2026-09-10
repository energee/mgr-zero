// app/(app)/routes/[id]/page.tsx — one route. Planned: the builder
// (route-form.tsx → save_route, depart_route). Departed: the run (stops with
// delivered times, Resume on the next open stop, route-run.tsx →
// return_route). Returned: read-only with the return time.
import { E } from "@/components/mgr/e";
import { DriverRouteView } from "@/components/mgr/views/driver-route";
import { ReturnRouteView } from "@/components/mgr/views/return-route";
import { RouteView } from "@/components/mgr/views/route";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toDriverRouteViewProps } from "@/lib/mgr/driver-route-view";
import { toReturnRouteViewProps } from "@/lib/mgr/return-route-view";
import { toRouteViewProps } from "@/lib/mgr/route-view";
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
      <RouteView
        model={toRouteViewProps({ title, backTo: "Deliveries", backHref: "/routes" })}
        form={<RouteForm route={route} candidates={candidates} drivers={list.drivers} today={list.today} />}
      />
    );
  }
  const openStops = route.stops.filter((s) => !s.delivered_at);
  const next = openStops[0];
  const driverVehicle = [driverLabel(route.driver_user_id), route.vehicle].filter(Boolean).join(" · ");
  const departed = formatTime(route.departed_at);
  const action = route.returned_at ? E.status(`Returned ${formatTime(route.returned_at)}`, "ok") : <ReturnRoute routeId={route.id} open={openStops.length} />;
  if (openStops.length === 0) {
    return (
      <ReturnRouteView
        model={toReturnRouteViewProps({
          title,
          backTo: "Deliveries",
          backHref: "/routes",
          driverVehicle,
          departed,
          stops: route.stops.map((s) => ({
            key: s.id,
            title: `Stop ${s.stop_no} · ${s.label}`,
            detail: s.delivered_at ? `delivered ${formatTime(s.delivered_at)}` : "",
          })),
        })}
        action={action}
      />
    );
  }
  return (
    <DriverRouteView
      model={toDriverRouteViewProps({
        title,
        backTo: "Deliveries",
        backHref: "/routes",
        driverVehicle,
        departed,
        stops: route.stops.map((s) => {
          const isNext = s.id === next?.id;
          if (s.delivered_at) {
            return { key: s.id, title: `Stop ${s.stop_no} · ${s.label}`, detail: `delivered ${formatTime(s.delivered_at)}`, trailing: "done", ok: true };
          }
          return {
            key: s.id,
            title: `Stop ${s.stop_no} · ${s.label}`,
            detail: isNext ? "next" : "later",
            verb: isNext ? "Resume" : undefined,
            href: isNext ? `/work/deliveries/${s.id}` : undefined,
            warning: isNext,
          };
        }),
      })}
      linkRows
      action={action}
    />
  );
}
