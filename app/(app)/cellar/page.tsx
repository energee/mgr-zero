// app/(app)/cellar/page.tsx — Beer › Cellar: tanks with beer in them right
// now (list_occupancies), each opening its reading log; Transfer is
// cellar-transfer-form.tsx → record_cellar_transfer; Addition is
// cellar-addition-form.tsx → record_batch_addition.
import { CellarMapView } from "@/components/mgr/views/cellar-map";
import { toCellarMapViewProps } from "@/lib/mgr/cellar-map-view";
import { formatVesselReading, type VesselReading } from "@/lib/mgr/vessel-detail-view";
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { getActiveBrewery } from "@/lib/brewery";
import { formatDateTime } from "@/lib/date-format";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { CellarTransferForm } from "./cellar-transfer-form";
import { CellarAdditionForm } from "./cellar-addition-form";
import type { AdditionLot, AdditionMaterial } from "@/lib/mgr/cellar-addition-view";
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
  const [occupancies, vessels, batches, unit, materials] = (await Promise.all([
    runCommand("list_occupancies", {}, ctx), runCommand("list_vessels", {}, ctx), runCommand("list_batches", {}, ctx), runCommand("get_gravity_unit", {}, ctx), runCommand("list_materials", {}, ctx),
  ])) as [Occupancy[], Vessel[], Batch[], { effective: GravityUnit }, AdditionMaterial[]];
  // The sheet is a client component: hand it the five fields it reads, not the whole materials row.
  const additionMaterials: AdditionMaterial[] = materials.map(({ id, name, category, base_uom, lot_tracked }) => ({ id, name, category, base_uom, lot_tracked }));
  const lots = (await runCommand("list_material_lots", {}, ctx)) as (AdditionLot & { material_id: string })[];
  const lotsByMaterial: Record<string, AdditionLot[]> = {};
  for (const lot of lots) (lotsByMaterial[lot.material_id] ??= []).push(lot);
  const completionCandidates = batches.filter((batch) => batch.brewed_on !== null && batch.closed_at === null)
    .map((batch) => ({ id: batch.id, label: `Batch ${batch.batch_no ?? "—"} · ${batch.brand_name ?? "no brand"}` }));

  const readings = Object.fromEntries(await Promise.all(occupancies.map(async occupancy => {
    const history = await runCommand("list_fermentation_readings", { occupancyId: occupancy.occupancy_id }, ctx) as VesselReading[];
    return [occupancy.occupancy_id, history[0] ? `${formatVesselReading(history[0], unit.effective)} · ${formatDateTime(history[0].at, brewery.timeZone)}` : "No readings yet"] as const;
  })));
  const model = toCellarMapViewProps(vessels, occupancies, readings, Object.fromEntries(vessels.map(vessel => [vessel.id, `/cellar/vessels/${vessel.id}`])), occupancyId => `/cellar/${occupancyId}/reading`);
  model.backHref = "/beer"; model.addHref = "/cellar/vessels/new"; model.brewHref = "/batches";
  return <CellarMapView model={model} transfer={<CellarTransferForm occupancies={occupancies} vessels={vessels} />} addition={<CellarAdditionForm occupancies={occupancies} materials={additionMaterials} lotsByMaterial={lotsByMaterial} />} complete={<BatchCompletionForm batches={completionCandidates} />} />;
}
