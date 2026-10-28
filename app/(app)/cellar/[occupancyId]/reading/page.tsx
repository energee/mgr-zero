// app/(app)/cellar/[occupancyId]/reading/page.tsx — the deep-link adapter for
// the Fermentation reading sheet. The latest row supplies reference values;
// reading history remains on Vessel detail. The sheet names the tank and,
// when known, its batch (#716). Closing returns to `?from=` (Cellar, Batches,
// or the batch) when the link came from there, else to Vessel detail (#1508).
import { cache } from "react";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { notFound } from "next/navigation";
import { readingIdentity } from "@/components/mgr/views/fermentation-reading";
import { readingReturnHref } from "@/lib/mgr/fermentation-reading-view";
import { ReadingForm } from "./reading-form";
import { navTitle } from "@/lib/mgr/nav";
import VesselPage from "@/app/(app)/cellar/vessels/[id]/page";

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

export default async function OccupancyReadingPage({ params, searchParams }: { params: Promise<{ occupancyId: string }>; searchParams: Promise<{ from?: string | string[] }> }) {
  const [{ occupancyId }, { from }] = await Promise.all([params, searchParams]);
  const { brewery, ctx, occupancy } = await getOccupancyReadingPageData(occupancyId);
  const [readings, gravityUnit] = await Promise.all([
    runCommand("list_fermentation_readings", { occupancyId }, ctx),
    runCommand("get_gravity_unit", {}, ctx),
  ]) as [Reading[], { effective: GravityUnit }];

  return (
    <>
      <VesselPage params={Promise.resolve({ id: occupancy.vessel_id })} />
      <ReadingForm
        occupancyId={occupancyId}
        identity={readingIdentity(occupancy)}
        unit={gravityUnit.effective}
        timeZone={brewery.timeZone}
        roles={brewery.roles}
        openByDefault
        returnHref={readingReturnHref(from, occupancy.vessel_id)}
        prior={readings[0] ? {
          tempF: readings[0].temp_f == null ? undefined : String(readings[0].temp_f),
          gravity: readings[0].gravity_plato == null ? undefined : formatGravity(readings[0].gravity_plato, gravityUnit.effective),
          ph: readings[0].ph == null ? undefined : String(readings[0].ph),
        } : undefined}
      />
    </>
  );
}
