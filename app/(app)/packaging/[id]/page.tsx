// app/(app)/packaging/[id]/page.tsx — one packaging run: planned facts and
// its planned outputs, with the one next action for its state (run-actions.tsx):
// pick a tank, start, or close; before it starts, reschedule or cancel the
// plan (plan-actions.tsx). get_packaging_run is the read.
import type { PackagingSourceOccupancy as Occupancy } from "@/components/mgr/views/plan-actions";
import { ChangePlan } from "../../plan-actions";
import type { PackagingClosePlan, PackagingMaterialRecord } from "@/lib/mgr/packaging-actuals";
import { E } from "@/components/mgr/e";
import { ClosePackagingRunView } from "@/components/mgr/views/close-packaging-run";
import { RunClosedView } from "@/components/mgr/views/run-closed";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { breweryToday } from "@/lib/commands/registry";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { runNo } from "@/lib/mgr/doc-no";
import { MaterialCorrection } from "./material-correction";
import { PickTankForm, StartRunButton, CloseRunForm } from "./run-actions";

type Run = {
  id: string; run_no: number; brand_id: string; occupancy_id: string | null; planned_on: string;
  cancelled_at: string | null; started_at: string | null; closed_at: string | null; bbl_drawn: number | null; note: string | null;
  brand_name: string | null; vessel_name: string | null;
};
type Output = { id: string; sku_id: string; qty_planned: number; qty_actual: number | null; sku_name: string | null };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

export default async function PackagingRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const { run, outputs } = (await orNotFound(runCommand("get_packaging_run", { runId: id }, ctx))) as { run: Run; outputs: Output[] };
  const picking = !run.cancelled_at && !run.closed_at && !run.occupancy_id;
  const closing = !run.closed_at && !!run.started_at;
  const needsMaterials = closing || !!run.closed_at;
  const [occupancies, locations, bins, today, closePlan, materialHistory] = (await Promise.all([
    picking ? runCommand("list_occupancies", {}, ctx) : [],
    needsMaterials ? runCommand("list_locations", {}, ctx) : [],
    needsMaterials ? runCommand("list_bins", {}, ctx) : [],
    closing ? breweryToday(ctx) : "",
    closing ? runCommand("get_packaging_close_plan", { runId: id }, ctx) : null,
    run.closed_at ? runCommand("get_packaging_material_record", { runId: id }, ctx) : { records: [] },
  ])) as [Occupancy[], Location[], Bin[], string, PackagingClosePlan | null, { records: PackagingMaterialRecord[] }];
  const latest = materialHistory.records.at(-1);
  // A closed run needs the current plan only to correct its latest record.
  const correctionPlan = latest ? await runCommand("get_packaging_close_plan", { runId: id }, ctx) as PackagingClosePlan : null;
  const title = runNo(run.run_no);
  if (run.closed_at) {
    return (
      <RunClosedView
        model={{ title, backTo: "Packaging runs", backHref: "/packaging", records: materialHistory.records }}
        fields={
          <>
            {E.fld("Barrels drawn", run.bbl_drawn === null ? "—" : Number(run.bbl_drawn))}
            {E.info("Closed: lot, finished goods and confirmed material usage are on the ledger.")}
          </>
        }
        action={latest && correctionPlan ? <MaterialCorrection key={latest.id} record={latest} plan={correctionPlan} locations={locations} bins={bins} /> : null}
      />
    );
  }
  return (
    <ClosePackagingRunView
      model={{
        title, backTo: "Packaging runs", backHref: "/packaging", brand: run.brand_name ?? "—",
        plannedOn: run.planned_on, cancelled: !!run.cancelled_at, source: run.vessel_name ?? "no source yet", showCloseReview: false,
        plannedOutputs: outputs.map((o) => [o.sku_name ?? o.sku_id.slice(0, 8), Number(o.qty_planned), o.qty_actual === null ? "Not recorded" : Number(o.qty_actual)]),
      }}
      planActions={!run.started_at ? <ChangePlan kind="packaging_run" id={run.id} plannedOn={run.planned_on} /> : undefined}
      action={
        <>
          {E.sp()}
          {!run.occupancy_id
            ? <PickTankForm runId={run.id} occupancies={occupancies} />
            : !run.started_at
              ? <StartRunButton runId={run.id} />
              : <CloseRunForm runId={run.id} outputs={outputs} locations={locations} bins={bins} today={today} initialPlan={closePlan!} />}
        </>
      }
    />
  );
}
