// app/(app)/locations/[id]/page.tsx — Location detail (screen record
// Location detail): name and kind with Edit → update_location. Timezone is
// the brewery's; bins open /locations/[id]/bins.
import { LocationView } from "@/components/mgr/views/location";
import { toLocationViewProps } from "@/lib/mgr/location-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { isUuid } from "@/lib/commands/context";
import { notFound } from "next/navigation";
import { LocationForm } from "../location-form";

type LocationRow = { id: string; name: string; kind: "warehouse" | "taproom" | "storage" };

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const location = ((await runCommand("list_locations", {}, ctx)) as LocationRow[]).find((l) => l.id === id);
  if (!location) notFound();
  const bins = (await runCommand("list_bins", { locationId: id }, ctx)) as { name: string }[];
  return <LocationView
    model={toLocationViewProps({ location, bins, backHref: "/locations" })}
    headerAction={brewery.role === "admin" ? <LocationForm location={location} /> : null}
    readOnly
    footer={null}
  />;
}
