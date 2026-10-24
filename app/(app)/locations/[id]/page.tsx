// app/(app)/locations/[id]/page.tsx — Location detail (screen record
// Location detail): name and uses with Edit → update_location. Timezone is
// the brewery's (Settings → Timezone, read from the membership); bins open
// /locations/[id]/bins.
import { LocationView } from "@/components/mgr/views/location";
import { toLocationViewProps } from "@/lib/mgr/location-view";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { LocationForm } from "../location-form";
import { getLocationPageData } from "../location-data";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { location } = await getLocationPageData(id);
  return { title: location.name };
}

export default async function LocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brewery, ctx, location } = await getLocationPageData(id);
  const bins = (await runCommand("list_bins", { locationId: id }, ctx)) as { name: string }[];
  return <LocationView
    model={toLocationViewProps({ location, bins, timezone: brewery.timeZone, backHref: "/locations" })}
    headerAction={brewery.roles.includes("admin") ? <LocationForm location={location} /> : null}
    readOnly
  />;
}
