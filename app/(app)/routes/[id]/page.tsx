// app/(app)/routes/[id]/page.tsx — one route. Planned: the builder
// (route-form.tsx → save_route, depart_route). Departed: the run (stops with
// delivered times, Resume on the next open stop, route-run.tsx →
// return_route). Returned: read-only with the return time.
import { E } from "@/components/mgr/e";
import { DriverRouteView } from "@/components/mgr/views/driver-route";
import { ReturnRouteView } from "@/components/mgr/views/return-route";
import { getActiveBrewery } from "@/lib/brewery";
import { formatDate } from "@/lib/date-format";
import { buildContext, isUuid } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { notFound } from "next/navigation";
import { formatTime } from "@/lib/time-window";
import { driverLabel, type RouteList } from "../labels";
import { RouteForm } from "../route-form";
import { ReturnRoute } from "../route-run";
import { navTitle } from "@/lib/mgr/nav";
import { cache } from "react";
import { orNotFound } from "@/lib/mgr/not-found";

const getRouteData = cache(async function getRouteData(id: string) {
  if (!isUuid(id)) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const list = await orNotFound(runCommand("list_routes", { id }, ctx)) as RouteList;
  const route = list.routes[0];
  if (!route) notFound();
  return { brewery, list, route };
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getRouteData(id);
  return { title: navTitle("/routes") };
}

export default async function RoutePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brewery, list, route } = await getRouteData(id);
  const title = `${route.name ?? "Route"} · ${formatDate(route.delivery_date)}`;
  if (!route.departed_at) {
    const candidates = [
      ...route.stops.map((s) => ({ id: (s.shipment_id ?? s.stock_transfer_id)!, label: s.label, kind: s.shipment_id ? "shipment" as const : "transfer" as const })),
      ...list.unassigned,
    ];
    return <RouteForm key={route.id} route={route} candidates={candidates} drivers={list.drivers} today={list.today} />;
  }
  const openStops = route.stops.filter((s) => !s.delivered_at);
  const next = openStops[0];
  const driverVehicle = [driverLabel(route), route.vehicle].filter(Boolean).join(" · ");
  const departed = formatTime(route.departed_at, brewery.timeZone);
  const action = route.returned_at ? E.status(`Returned ${formatTime(route.returned_at, brewery.timeZone)}`, "ok") : <ReturnRoute routeId={route.id} open={openStops.length} />;
  if (openStops.length === 0) {
    return (
      <ReturnRouteView
        model={{
          title,
          backHref: "/routes",
          driverVehicle,
          departed,
          stops: route.stops.map((s) => ({
            key: s.id,
            title: `Stop ${s.stop_no} · ${s.label}`,
            outstanding: s.outstanding_qty,
            returnHref: `/work/deliveries/${s.id}/return`,
            detail: s.delivered_at ? `${s.outcome ?? "delivered"} ${formatTime(s.delivered_at, brewery.timeZone)}` : "",
          })),
        }}
        action={action}
      />
    );
  }
  return (
    <DriverRouteView
      model={{
        title,
        backHref: "/routes",
        driverVehicle,
        departed,
        stops: route.stops.map((s) => {
          const isNext = s.id === next?.id;
          if (s.delivered_at) {
            const done = { key: s.id, title: `Stop ${s.stop_no} · ${s.label}`, detail: `${s.outcome ?? "delivered"} ${formatTime(s.delivered_at, brewery.timeZone)}` };
            return s.outstanding_qty
              ? { ...done, trailing: `${s.outstanding_qty} awaiting check-in`, verb: "Check in", href: `/work/deliveries/${s.id}/return`, warning: true }
              : { ...done, trailing: "done", ok: true };
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
      }}
      linkRows
      action={action}
    />
  );
}
