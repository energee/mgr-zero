// app/(app)/cellar/[occupancyId]/reading/page.tsx — the deep-link adapter for
// the Fermentation reading sheet. The latest row supplies reference values;
// reading history remains on Vessel detail. The sheet names the tank and,
// when known, its batch (#716).
import { cache } from "react";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { notFound } from "next/navigation";
import { readingIdentity } from "@/components/mgr/views/fermentation-reading";
import { ReadingForm } from "./reading-form";
import { navTitle } from "@/lib/mgr/nav";

export async function generateMetadata({ params }: { params: Promise<{ occupancyId: string }> }) {
  const { occupancyId } = await params;
  await getOccupancyReadingPageData(occupancyId);
  return { title: navTitle("/cellar") };
}

type Occupancy = { occupancy_id: string; vessel_id: string; vessel_name: string | null; batch_no: number | null; brand_name: string | null; bbl: number };
type Reading = { temp_f: number | null; gravity_plato: number | null; ph: number | null };

const getOccupancyReadingPageData = cache(async function getOccupancyReadingPageData(occupancyId: string) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const occupancies = await runCommand("list_occupancies", {}, ctx) as Occupancy[];
  const occupancy = occupancies.find((o) => o.occupancy_id === occupancyId) ?? notFound();
  return { brewery, ctx, occupancy };
});

export default async function OccupancyReadingPage({ params }: { params: Promise<{ occupancyId: string }> }) {
  const { occupancyId } = await params;
  const { brewery, ctx, occupancy } = await getOccupancyReadingPageData(occupancyId);
  const [readings, gravityUnit] = await Promise.all([
    runCommand("list_fermentation_readings", { occupancyId }, ctx),
    runCommand("get_gravity_unit", {}, ctx),
  ]) as [Reading[], { effective: GravityUnit }];

  return (
    <ReadingForm
      occupancyId={occupancyId}
      identity={readingIdentity(occupancy)}
      unit={gravityUnit.effective}
      roles={brewery.roles}
      openByDefault
      returnHref={`/cellar/vessels/${occupancy.vessel_id}`}
      prior={readings[0] ? {
        tempF: readings[0].temp_f == null ? undefined : String(readings[0].temp_f),
        gravity: readings[0].gravity_plato == null ? undefined : formatGravity(readings[0].gravity_plato, gravityUnit.effective),
        ph: readings[0].ph == null ? undefined : String(readings[0].ph),
      } : undefined}
    />
  );
}
