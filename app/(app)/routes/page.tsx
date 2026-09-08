// app/(app)/routes/page.tsx — Work › Deliveries (screen record Routes): every
// route not yet returned from list_routes with its next verb, the shipped
// orders and picked transfers on no route, and New route → /routes/new.
// Warehouse and Admin.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { driverLabel, type RouteList } from "./labels";

export default async function RoutesPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { routes, unassigned } = (await runCommand("list_routes", {}, ctx)) as RouteList;
  const waiting = [...unassigned.shipments, ...unassigned.transfers];
  return (
    <>
      {E.hd("Deliveries", "routes", E.btn("New route", "p", "/routes/new"))}
      {routes.length === 0 && waiting.length === 0 && E.blank("No routes yet")}
      {routes.map((r) => {
        const done = r.stops.filter((s) => s.delivered_at).length;
        const state = r.departed_at ? `departed · ${done} of ${r.stops.length} delivered` : `${r.stops.length} stop${r.stops.length === 1 ? "" : "s"} · ${driverLabel(r.driver_user_id)}`;
        const verb = r.departed_at ? E.act("Resume", "info", `/routes/${r.id}`) : r.driver_user_id ? E.act("Open", "primary", `/routes/${r.id}`) : E.act("Assign", "attention", `/routes/${r.id}`);
        return <div key={r.id}>{E.row(`${r.name ?? "Route"} · ${r.delivery_date}`, state, verb, r.driver_user_id ? "" : "w")}</div>;
      })}
      {waiting.map((d) => <div key={d.id}>{E.row(d.label, "shipped · no route", E.act("Add to route", "attention", "/routes/new"), "w")}</div>)}
    </>
  );
}
