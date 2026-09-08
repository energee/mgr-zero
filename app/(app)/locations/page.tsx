// app/(app)/locations/page.tsx — Locations (screen record Locations): the
// brewery's locations from list_locations, each opening its detail. Adding
// a location is location-form.tsx → create_location. Admin only in nav.
import { LocationsView } from "@/components/mgr/views/locations";
import { toLocationsViewProps } from "@/lib/mgr/locations-view";
import Link from "next/link";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { LocationForm } from "./location-form";

type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" | "storage" };

export default async function LocationsPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const locations = (await runCommand("list_locations", {}, ctx)) as LocationRow[];
  return <LocationsView
    model={toLocationsViewProps({ locations, backHref: brewery.role === "admin" ? "/settings" : "/beer" })}
    backLabel={brewery.role === "admin" ? "Settings" : "Beer"}
    rowActionLabel={brewery.role === "admin" ? "Edit" : "Review"}
    createAction={brewery.role === "admin" ? <LocationForm /> : null}
    linkRows
    footer={brewery.role !== "brewer" ? <Link href="/inventory" className="text-xs text-muted-foreground underline underline-offset-2">All finished goods inventory</Link> : null}
  />;
}
