// app/(app)/batches/[id]/page.tsx — one batch: planned facts, and either the
// occupancy it landed in (brewed) or record-brew-day-form.tsx (planned).
// get_brew_day is the read; only open vessels not already occupied make
// sense to offer, but record_brew_day itself is the one place that refuses
// an overlap, so every vessel is offered here.
import { brewPlanActuals, type BrewPlan, type BrewMaterialSource, type BrewRecordView } from "@/lib/mgr/brew-day-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { breweryToday } from "@/lib/commands/registry";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { batNo } from "@/lib/mgr/doc-no";
import { ChangePlan } from "../../plan-actions";
import { RecordBrewDayForm } from "./record-brew-day-form";

type Batch = {
  id: string; batch_no: number | null; intended_brand_id: string | null; recipe_version_id: string | null;
  planned_on: string; planned_bbl: number; brewed_on: string | null; cancelled_at: string | null; note: string | null;
};
type Occupancy = { id: string; vessel_id: string; initial_bbl: number; started_at: string; vessel_name: string };
type Vessel = { id: string; name: string; kind: string; capacity_bbl: number };

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ batch, occupancy }, vessels, today, plan, history] = (await Promise.all([
    orNotFound(runCommand("get_brew_day", { batchId: id }, ctx)),
    runCommand("list_vessels", {}, ctx),
    breweryToday(ctx),
    runCommand("get_brew_day_plan", { batchId: id }, ctx),
    runCommand("get_brew_record", { batchId: id }, ctx),
  ])) as [{ batch: Batch; occupancy: Occupancy | null }, Vessel[], string, { plan: BrewPlan; sources: BrewMaterialSource[] }, { records: BrewRecordView[] }];

  const recorded = Boolean(batch.brewed_on || occupancy);
  const currentRecord = history.records.at(-1);
  const model = {
    plan: plan.plan, sources: plan.sources, records: history.records, actuals: brewPlanActuals(plan.plan, Number(batch.planned_bbl), plan.sources), process: {}, confirmEmpty: false,
    title: batNo(batch.batch_no), backHref: "/batches",
    planned: Number(batch.planned_bbl) + " bbl · " + batch.planned_on, note: batch.note ?? undefined,
    recorded, cancelledAt: batch.cancelled_at, vesselId: occupancy?.vessel_id ?? "", vesselName: occupancy?.vessel_name, vessels,
    initialBbl: currentRecord ? String(currentRecord.initial_bbl) : occupancy ? String(Number(occupancy.initial_bbl)) : recorded ? "" : String(Number(batch.planned_bbl)),
    brewedOn: batch.brewed_on ?? (recorded ? "" : today),
  };
  return <RecordBrewDayForm key={`${batch.id}:${history.records.length}`} batchId={batch.id} model={model} planActions={<ChangePlan kind="batch" id={batch.id} plannedOn={batch.planned_on} />} />;
}
