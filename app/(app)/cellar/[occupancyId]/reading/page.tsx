// app/(app)/cellar/[occupancyId]/reading/page.tsx — the deep-link adapter for
// the Fermentation reading sheet. The latest row supplies reference values;
// reading history remains on Vessel detail.
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { notFound } from "next/navigation";
import { ReadingForm } from "./reading-form";

type Occupancy = { occupancy_id: string; vessel_id: string; vessel_name: string | null; brand_name: string | null; bbl: number };
type Reading = { temp_f: number; gravity_plato: number | null; ph: number | null };

export default async function OccupancyReadingPage({ params }: { params: Promise<{ occupancyId: string }> }) {
  const { occupancyId } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [occupancies, readings, gravityUnit] = (await Promise.all([
    runCommand("list_occupancies", {}, ctx), runCommand("list_fermentation_readings", { occupancyId }, ctx),
    runCommand("get_gravity_unit", {}, ctx),
  ])) as [Occupancy[], Reading[], { effective: GravityUnit }];
  const occupancy = occupancies.find((o) => o.occupancy_id === occupancyId) ?? notFound();

  return (
    <ReadingForm
      occupancyId={occupancyId}
      occupancyLabel={occupancy.vessel_name ?? "unknown vessel"}
      unit={gravityUnit.effective}
      role={brewery.role as "admin" | "brewer"}
      openByDefault
      returnHref={`/cellar/vessels/${occupancy.vessel_id}`}
      prior={readings[0] ? {
        tempF: String(readings[0].temp_f),
        gravity: readings[0].gravity_plato == null ? undefined : formatGravity(readings[0].gravity_plato, gravityUnit.effective),
        ph: readings[0].ph == null ? undefined : String(readings[0].ph),
      } : undefined}
    />
  );
}
