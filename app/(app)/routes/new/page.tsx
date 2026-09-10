// app/(app)/routes/new/page.tsx — New route: the builder (route-form.tsx →
// save_route) over every shipped order and picked transfer on no route.
import { RouteView } from "@/components/mgr/views/route";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toRouteViewProps } from "@/lib/mgr/route-view";
import "@/lib/commands/all";
import type { RouteList } from "../labels";
import { RouteForm } from "../route-form";

export default async function NewRoutePage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { unassigned, drivers, today } = (await runCommand("list_routes", {}, ctx)) as RouteList;
  return (
    <RouteView
      model={toRouteViewProps({ title: "New route", backTo: "Deliveries", backHref: "/routes" })}
      form={<RouteForm route={null} candidates={unassigned} drivers={drivers} today={today} />}
    />
  );
}
