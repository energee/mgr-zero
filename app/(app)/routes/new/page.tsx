// app/(app)/routes/new/page.tsx — New route: the builder (route-form.tsx →
// save_route) over every shipped order and picked transfer on no route.
// ?add={id} (Add to route on Shipment done or a Deliveries row) ticks that document.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import type { RouteList } from "../labels";
import { RouteForm } from "../route-form";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/routes/new") };

export default async function NewRoutePage({ searchParams }: { searchParams: Promise<{ add?: string }> }) {
  const { add } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { unassigned, drivers, today } = (await runCommand("list_routes", {}, ctx)) as RouteList;
  return <RouteForm route={null} candidates={unassigned} drivers={drivers} today={today} add={add} />;
}
