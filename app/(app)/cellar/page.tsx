// app/(app)/cellar/page.tsx — Beer › Cellar: tanks with beer in them right
// now (list_occupancies), each opening its reading log; latest readings
// come embedded in list_batches({ readings: true, open: true }), one read for
// every tank (every open occupancy belongs to a brewed, uncompleted batch); Transfer is
// cellar-transfer-form.tsx → record_cellar_transfer; Addition is
// cellar-addition-form.tsx → record_batch_addition.
import { CellarMapView } from "@/components/mgr/views/cellar-map";
import { cellarReadings, toCellarMapViewProps } from "@/lib/mgr/cellar-map-view";
import type { VesselReading } from "@/lib/mgr/vessel-detail-view";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { canRun } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { CellarTransferForm } from "./cellar-transfer-form";
import { CellarAdditionForm } from "./cellar-addition-form";
import type { AdditionLot, AdditionMaterial } from "@/lib/mgr/cellar-addition-view";
import { BatchCompletionForm } from "./batch-completion-form";
import { additionChoices } from "./occupancy-actions";
import { navTitle } from "@/lib/mgr/nav";
import { batNo } from "@/lib/mgr/doc-no";

export const metadata = { title: navTitle("/cellar") };

type Occupancy = {
  occupancy_id: string; vessel_id: string; vessel_name: string | null; batch_id: string; batch_no: number | null;
  brand_name: string | null; started_at: string; bbl: number;
};
type Vessel = { id: string; name: string; kind: string; capacity_bbl: number };
type Batch = {
  id: string; batch_no: number | null; brand_name: string | null;
  active_occupancies: { id: string; latest_reading?: VesselReading | null }[];
};

export default async function CellarPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [occupancies, vessels, batches, unit, materials, lots] = (await Promise.all([
    runCommand("list_occupancies", {}, ctx), runCommand("list_vessels", {}, ctx), runCommand("list_batches", { readings: true, open: true }, ctx), runCommand("get_gravity_unit", {}, ctx), runCommand("list_materials", {}, ctx),
    runCommand("list_material_lots", {}, ctx),
  ])) as [Occupancy[], Vessel[], Batch[], { effective: GravityUnit }, AdditionMaterial[], (AdditionLot & { material_id: string })[]];
  const { materials: additionMaterials, lotsByMaterial } = additionChoices(materials, lots);
  const completionCandidates = batches.map((batch) => ({ id: batch.id, label: `${batNo(batch.batch_no)} · ${batch.brand_name ?? "no brand"}` }));

  const readings = cellarReadings(batches, unit.effective, brewery.timeZone);
  const model = toCellarMapViewProps(vessels, occupancies, readings, Object.fromEntries(vessels.map(vessel => [vessel.id, `/cellar/vessels/${vessel.id}`])), occupancyId => `/cellar/${occupancyId}/reading?from=/cellar`);
  model.backHref = "/beer"; model.addHref = canRun(ctx, "upsert_vessel") ? "/cellar/vessels/new" : null; model.brewHref = "/batches";
  return <CellarMapView model={model} transfer={<CellarTransferForm occupancies={occupancies} vessels={vessels} addVesselHref={model.addHref} disabled={model.actionsOff} />} addition={<CellarAdditionForm occupancies={occupancies} materials={additionMaterials} lotsByMaterial={lotsByMaterial} disabled={model.actionsOff} />} complete={<BatchCompletionForm batches={completionCandidates} />} />;
}
