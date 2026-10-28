// app/(app)/routes/page.tsx — Work › Deliveries (screen record Routes): the
// Status pick's routes from list_routes — Open (every route not yet returned)
// by default, or ?status=returned newest first — with their next verb
// (routeNext; an assigned route not yet departed, or a returned one, is a plain
// row link). Open also lists the shipped orders and picked transfers on no
// route. New route → /routes/new.
// Warehouse and Admin. New route is size="sm" like every Work list's create
// button, so the tab strip sits at the same height (#1226).
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { RoutesView } from "@/components/mgr/views/routes";
import { getActiveBrewery } from "@/lib/brewery";
import { formatDate } from "@/lib/date-format";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { workHrefsFor } from "@/components/mgr/work-tabs";
import { ROUTE_STATUSES, routeNext, toRoutesViewProps } from "@/lib/mgr/routes-view";
import { listParams } from "@/lib/mgr/list-params";
import "@/lib/commands/all";
import { driverLabel, type RouteList } from "./labels";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/routes") };

const routesParams = z.object({ status: z.enum(ROUTE_STATUSES).catch("open") });

export default async function RoutesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { status } = listParams(routesParams, await searchParams).params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { routes, unassigned, anyReturned } = (await runCommand("list_routes", { status }, ctx)) as RouteList;
  return <RoutesView model={toRoutesViewProps({ title: "Deliveries", subtitle: "", status, anyReturned, linked: true, rows: [
    ...routes.map(route => ({
      key: route.id, title: (route.name ?? "Route") + " · " + formatDate(route.delivery_date),
      detail: route.departed_at ? (route.returned_at ? "Returned · " : "Departed · ") + route.stops.filter(stop => stop.delivered_at).length + " of " + route.stops.length + " delivered" : route.stops.length + (route.stops.length === 1 ? " stop · " : " stops · ") + driverLabel(route),
      ...routeNext(route),
      href: "/routes/" + route.id, warning: !route.driver_user_id,
    })),
    ...(status === "open" ? unassigned : []).map(document => ({ key: document.id, title: document.label, detail: "Shipped · no route", verb: "Add to route", tone: "attention" as const, href: "/routes/new", warning: true })),
  ] })} createAction={<Button size="sm" asChild><Link href="/routes/new">New route</Link></Button>} workHrefs={workHrefsFor(brewery.roles)} />;
}
