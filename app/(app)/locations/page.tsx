// app/(app)/locations/page.tsx — Locations (screen record Locations): the
// brewery's locations from list_locations, each opening its detail. Adding
// a location is location-form.tsx → create_location. Admin only in nav.
import { LocationsInventoryLink, LocationsView } from "@/components/mgr/views/locations";
import { toLocationsViewProps } from "@/lib/mgr/locations-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { LocationForm } from "./location-form";
import { canRun } from "@/lib/commands/registry";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/locations") };

type LocationRow = { id: string; name: string; uses: ("warehouse" | "taproom" | "storage")[] };

export default async function LocationsPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const locations = (await runCommand("list_locations", {}, ctx)) as LocationRow[];
  return <LocationsView
    model={toLocationsViewProps({ locations, backHref: brewery.roles.includes("admin") ? "/settings" : "/beer" })}
    backLabel={brewery.roles.includes("admin") ? "Settings" : "Beer"}
    rowActionLabel={brewery.roles.includes("admin") ? "Edit" : "Review"}
    createAction={brewery.roles.includes("admin") ? <LocationForm /> : null}
    linkRows
    footer={canRun(ctx, "get_atp") ? <LocationsInventoryLink href="/inventory" /> : null}
  />;
}
