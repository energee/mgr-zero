// app/(app)/locations/[id]/page.tsx — Location detail (screen record
// Location detail): name and kind with Edit → update_location. Timezone is
// the brewery's; bins stay gated until Program 2.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { isUuid } from "@/lib/commands/context";
import { notFound } from "next/navigation";
import { LocationForm } from "../location-form";

type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" | "storage" };
const KIND_LABEL: Record<LocationRow["kind"], string> = { warehouse: "Warehouse", taproom: "Taproom", storage: "Storage" };

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const location = ((await runCommand("list_locations", {}, ctx)) as LocationRow[]).find((l) => l.id === id);
  if (!location) notFound();
  return (
    <>
      {E.back("Locations", location.name, brewery.role === "admin" ? <LocationForm location={location} /> : undefined, "/locations")}
      {E.fld("Type", KIND_LABEL[location.kind])}
      {E.fld("Timezone", "Brewery default")}
      {E.gated("Location bins")}
    </>
  );
}
