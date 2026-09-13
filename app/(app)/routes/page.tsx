// app/(app)/routes/page.tsx — Work › Deliveries (screen record Routes): every
// route not yet returned from list_routes with its next verb, the shipped
// orders and picked transfers on no route, and New route → /routes/new.
// Warehouse and Admin.
import { E } from "@/components/mgr/e";
import { RoutesView } from "@/components/mgr/views/routes";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { workHrefsFor } from "@/components/mgr/work-tabs";
import { toRoutesViewProps } from "@/lib/mgr/routes-view";
import "@/lib/commands/all";
import { driverLabel, type RouteList } from "./labels";

export default async function RoutesPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { routes, unassigned } = (await runCommand("list_routes", {}, ctx)) as RouteList;
  return <RoutesView model={toRoutesViewProps({ title: "Work", subtitle: "routes", rows: [
    ...routes.map(route => ({
      key: route.id, title: (route.name ?? "Route") + " · " + route.delivery_date,
      detail: route.departed_at ? "departed · " + route.stops.filter(stop => stop.delivered_at).length + " of " + route.stops.length + " delivered" : route.stops.length + (route.stops.length === 1 ? " stop · " : " stops · ") + driverLabel(route.driver_user_id),
      verb: route.departed_at ? "Resume" : route.driver_user_id ? "Open" : "Assign",
      tone: route.departed_at ? "info" as const : route.driver_user_id ? "primary" as const : "attention" as const,
      href: "/routes/" + route.id, warning: !route.driver_user_id,
    })),
    ...unassigned.map(document => ({ key: document.id, title: document.label, detail: "shipped · no route", verb: "Add to route", tone: "attention" as const, href: "/routes/new", warning: true })),
  ] })} createAction={E.btn("New route", "p", "/routes/new")} workHrefs={workHrefsFor(brewery.role)} />;
}
