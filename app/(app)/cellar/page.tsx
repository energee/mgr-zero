// app/(app)/cellar/page.tsx — Beer › Cellar: tanks with beer in them right
// now (list_occupancies), each opening its reading log; Transfer is
// cellar-transfer-form.tsx → record_cellar_transfer.
import { CellarMapView } from "@/components/mgr/views/cellar-map";
import { toCellarMapViewProps } from "@/lib/mgr/cellar-map-view";
import { formatVesselReading, type VesselReading } from "@/lib/mgr/vessel-detail-view";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { CellarTransferForm } from "./cellar-transfer-form";
import { BatchCompletionForm } from "./batch-completion-form";

type Occupancy = {
  occupancy_id: string; vessel_id: string; vessel_name: string | null; batch_id: string; batch_no: number | null;
  brand_name: string | null; started_at: string; bbl: number;
};
type Vessel = { id: string; name: string; kind: string; capacity_bbl: number };
type Batch = {
  id: string; batch_no: number | null; brand_name: string | null;
  brewed_on: string | null; closed_at: string | null;
};

export default async function CellarPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [occupancies, vessels, batches, unit] = (await Promise.all([
    runCommand("list_occupancies", {}, ctx), runCommand("list_vessels", {}, ctx), runCommand("list_batches", {}, ctx), runCommand("get_gravity_unit", {}, ctx),
  ])) as [Occupancy[], Vessel[], Batch[], { effective: GravityUnit }];
  const completionCandidates = batches.filter((batch) => batch.brewed_on !== null && batch.closed_at === null)
    .map((batch) => ({ id: batch.id, label: `Batch ${batch.batch_no ?? "—"} · ${batch.brand_name ?? "no brand"}` }));

  const readings = Object.fromEntries(await Promise.all(occupancies.map(async occupancy => {
    const history = await runCommand("list_fermentation_readings", { occupancyId: occupancy.occupancy_id }, ctx) as VesselReading[];
    return [occupancy.occupancy_id, history[0] ? `${formatVesselReading(history[0], unit.effective)} · ${history[0].at}` : "No readings yet"];
  })));
  const model = toCellarMapViewProps(vessels, occupancies, readings, Object.fromEntries(vessels.map(vessel => [vessel.id, `/cellar/vessels/${vessel.id}`])));
  model.backHref = "/beer"; model.addHref = "/cellar/vessels/new"; model.brewHref = "/batches";
  model.readingHref = occupancies[0] ? `/cellar/${occupancies[0].occupancy_id}/reading` : null;
  return <CellarMapView model={model} transfer={<CellarTransferForm occupancies={occupancies} vessels={vessels} />} complete={<BatchCompletionForm batches={completionCandidates} />} />;
}
