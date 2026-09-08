// app/(app)/routes/new/page.tsx — New route: the builder (route-form.tsx →
// save_route) over every shipped order and picked transfer on no route.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import type { RouteList } from "../labels";
import { RouteForm } from "../route-form";

export default async function NewRoutePage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { unassigned, drivers } = (await runCommand("list_routes", {}, ctx)) as RouteList;
  return (
    <>
      {E.back("Deliveries", "New route", undefined, "/routes")}
      <RouteForm route={null} candidates={unassigned} drivers={drivers} />
    </>
  );
}
