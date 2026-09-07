// app/(app)/packaging/[id]/page.tsx — one packaging run: planned facts and
// its planned outputs, with the one next action for its state (run-actions.tsx):
// pick a tank, start, or close. get_packaging_run is the read.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { runNo } from "@/lib/mgr/doc-no";
import { PickTankForm, StartRunButton, CloseRunForm } from "./run-actions";

type Run = {
  id: string; run_no: number; brand_id: string; occupancy_id: string | null; planned_on: string;
  started_at: string | null; closed_at: string | null; bbl_drawn: number | null; note: string | null;
  brand_name: string | null; vessel_name: string | null;
};
type Output = { id: string; sku_id: string; qty_planned: number; qty_actual: number | null; sku_name: string | null };
type Occupancy = { occupancy_id: string; vessel_name: string | null; brand_name: string | null; bbl: number };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

export default async function PackagingRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ run, outputs }, occupancies, locations, bins] = (await Promise.all([
    orNotFound(runCommand("get_packaging_run", { runId: id }, ctx)),
    runCommand("list_occupancies", {}, ctx), runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx),
  ])) as [{ run: Run; outputs: Output[] }, Occupancy[], Location[], Bin[]];

  return (
    <>
      {E.back("Packaging", runNo(run.run_no))}
      {E.fld("Brand", run.brand_name ?? "—")}
      {E.fld("Planned", run.planned_on)}
      {E.fld("Source", run.vessel_name ?? "no source yet")}
      {E.ttl("Planned outputs")}
      {E.tbl(["SKU", "planned", "actual"], outputs.map((o) => [o.sku_name ?? o.sku_id.slice(0, 8), Number(o.qty_planned), o.qty_actual === null ? "—" : Number(o.qty_actual)]))}
      {run.closed_at ? (
        <>
          {E.fld("Barrels drawn", run.bbl_drawn === null ? "—" : Number(run.bbl_drawn))}
          {E.info("Closed: lot, finished goods and material consumption are on the ledger.")}
        </>
      ) : (
        <>
          {E.sp()}
          {!run.occupancy_id
            ? <PickTankForm runId={run.id} occupancies={occupancies} />
            : !run.started_at
              ? <StartRunButton runId={run.id} />
              : <CloseRunForm runId={run.id} outputs={outputs} locations={locations} bins={bins} />}
        </>
      )}
    </>
  );
}
