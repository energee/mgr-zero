// app/(app)/cellar/[occupancyId]/reading/page.tsx — one occupancy's
// fermentation readings (list_fermentation_readings), newest first, with a
// form to log the next one. Today's "fermentation reading overdue" reason
// links here. Gravity is stored in degrees Plato; the unit it is shown and
// typed in is resolved once here (get_gravity_unit) and handed to both the
// list and the form.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { ReadingForm } from "./reading-form";

type Occupancy = { occupancy_id: string; vessel_name: string | null; brand_name: string | null; bbl: number };
type Reading = { id: string; at: string; temp_f: number; gravity_plato: number | null; ph: number | null; note: string | null };

export default async function OccupancyReadingPage({ params }: { params: Promise<{ occupancyId: string }> }) {
  const { occupancyId } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [occupancies, readings, gravityUnit] = (await Promise.all([
    runCommand("list_occupancies", {}, ctx), runCommand("list_fermentation_readings", { occupancyId }, ctx),
    runCommand("get_gravity_unit", {}, ctx),
  ])) as [Occupancy[], Reading[], { effective: GravityUnit }];
  const occupancy = occupancies.find((o) => o.occupancy_id === occupancyId);

  return (
    <>
      {E.back("Cellar", occupancy ? `${occupancy.vessel_name ?? "—"} · ${occupancy.brand_name ?? "no brand yet"}` : "Fermentation reading", <ReadingForm
        occupancyId={occupancyId}
        occupancyLabel={occupancy?.vessel_name ?? "unknown vessel"}
        unit={gravityUnit.effective}
        role={brewery.role as "admin" | "brewer"}
        prior={readings[0] ? {
          tempF: String(readings[0].temp_f),
          gravity: readings[0].gravity_plato == null ? undefined : formatGravity(readings[0].gravity_plato, gravityUnit.effective),
          ph: readings[0].ph == null ? undefined : String(readings[0].ph),
        } : undefined}
      />)}
      {readings.length === 0
        ? E.blank("No readings yet")
        : readings.map((r) => (
            <div key={r.id}>
              {E.row(
                new Date(r.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
                `${r.temp_f} °F${r.gravity_plato !== null ? ` · ${formatGravity(r.gravity_plato, gravityUnit.effective)}` : ""}${r.ph !== null ? ` · pH ${r.ph}` : ""}${r.note ? ` · ${r.note}` : ""}`,
              )}
            </div>
          ))}
    </>
  );
}
