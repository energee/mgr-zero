// app/(app)/locations/page.tsx — Locations (screen record Locations): the
// brewery's locations from list_locations, each opening its detail. Adding
// a location is location-form.tsx → create_location. Admin only in nav.
import Link from "next/link";
import { E } from "@/components/mgr/e";
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
  return (
    <>
      {E.back(brewery.role === "admin" ? "Settings" : "Beer", "Locations", brewery.role === "admin" ? <LocationForm /> : undefined, brewery.role === "admin" ? "/settings" : "/beer")}
      {locations.length === 0
        ? E.blank("No locations yet")
        : locations.map((l) => <div key={l.id}>{E.row(l.name, l.kind, E.act(brewery.role === "admin" ? "Edit" : "Review", "primary", `/locations/${l.id}`))}</div>)}
      {brewery.role !== "brewer" && <Link href="/inventory" className="text-xs text-muted-foreground underline underline-offset-2">All finished goods inventory</Link>}
    </>
  );
}
