// app/(app)/locations/page.tsx — Locations (screen record Locations): the
// brewery's locations from list_locations, each opening its detail. Adding
// a location is location-form.tsx → create_location. Admin only in nav.
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { LocationForm } from "./location-form";

type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" | "storage" };

export default async function LocationsPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const locations = (await runCommand("list_locations", {}, ctx)) as LocationRow[];
  return (
    <>
      {E.back("Settings", "Locations", brewery.role === "admin" ? <LocationForm /> : undefined, "/settings/team")}
      {locations.length === 0
        ? E.blank("No locations yet")
        : locations.map((l) => <div key={l.id}>{E.row(l.name, l.kind, E.act("Edit", "primary", `/locations/${l.id}`))}</div>)}
      <Link href="/inventory" className="text-xs text-muted-foreground underline underline-offset-2">Inventory by location</Link>
    </>
  );
}
