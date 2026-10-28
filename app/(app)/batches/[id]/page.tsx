// app/(app)/batches/[id]/page.tsx — one batch. A planned batch (not brewed,
// not cancelled) has two tabs, switched by `?tab=` links (openBrewTab picks the
// default: Brew day once Prep pulls are saved, else Prep). Prep (PrepForm →
// BrewPrepView) saves the pull list; Brew day (BrewTimelineView) starts each
// ingredient from its saved pull, else plan; vessel and date sit in Knockout.
// A recorded batch (history, Correct turn, Add brew turn; once completed, its
// completion day and write-off) and a cancelled one keep BrewDayView; the
// timeline does not model corrections or turns. Every state is titled with the
// batch number and brand (batchLabel), as the vessel page names the batch.
// get_brew_day is the read; only open vessels not already occupied make
// sense to offer, but record_brew_day itself is the one place that refuses
// an overlap, so every active vessel is offered here (list_vessels hides
// retired ones, and the database refuses beer into them).
import { cache } from "react";
import { notFound } from "next/navigation";
import { brewedAsPlanned, brewPlanActuals, currentBrewRecords, type BrewPlan, type BrewMaterialSource, type BrewPull, type BrewRecordView } from "@/lib/mgr/brew-day-view";
import { brewIngredients, brewTargets, laterAdditions, openBrewTab } from "@/lib/mgr/brew-prep-view";
import { getActiveBrewery } from "@/lib/brewery";
import { formatDate } from "@/lib/date-format";
import { buildContext, isUuid } from "@/lib/commands/context";
import { breweryToday } from "@/lib/commands/registry";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { batchLabel } from "@/lib/mgr/doc-no";
import { ChangePlan } from "../../plan-actions";
import { PrepForm } from "./prep-form";
import { RecordBrewDayForm, RecordBrewTimelineForm } from "./record-brew-day-form";
import { OccupancyActions } from "@/app/(app)/cellar/occupancy-actions";
import { navTitle } from "@/lib/mgr/nav";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getBatchPageData(id);
  return { title: navTitle("/batches") };
}

type Batch = {
  id: string; batch_no: number | null; intended_brand_id: string | null; brand_name: string | null; recipe_version_id: string | null;
  planned_on: string; planned_bbl: number; brewed_on: string | null; closed_at: string | null; cancelled_at: string | null; note: string | null;
};
type Occupancy = { id: string; vessel_id: string; initial_bbl: number; started_at: string; vessel_name: string };
type Vessel = { id: string; name: string; kind: string; capacity_bbl: number };
type Plan = { batch: { planned_vessel_id: string | null }; plan: BrewPlan; sources: BrewMaterialSource[]; pulls: BrewPull[] };

const getBatchPageData = cache(async function getBatchPageData(id: string) {
  if (!isUuid(id)) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  // Confirm the batch exists before its dependent RPCs can fail independently.
  const { batch, occupancy, writeOffBbl } = await orNotFound(runCommand("get_brew_day", { batchId: id }, ctx)) as { batch: Batch; occupancy: Occupancy | null; writeOffBbl: number | null };
  return { brewery, ctx, batch, occupancy, writeOffBbl };
});

export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const { brewery, ctx, batch, occupancy, writeOffBbl } = await getBatchPageData(id);
  const [vessels, today, plan, history] = (await Promise.all([
    runCommand("list_vessels", {}, ctx),
    breweryToday(ctx),
    runCommand("get_brew_day_plan", { batchId: id }, ctx),
    runCommand("get_brew_record", { batchId: id }, ctx),
  ])) as [Vessel[], string, Plan, { records: BrewRecordView[] }];

  const recorded = Boolean(batch.brewed_on || occupancy);
  const plannedBbl = Number(batch.planned_bbl), planned = plannedBbl + " bbl · " + formatDate(batch.planned_on);
  const title = batchLabel(batch.batch_no, batch.brand_name);
  if (!recorded && !batch.cancelled_at) {
    // A planned tank retired since Prep is not in list_vessels: start with none chosen rather than a hidden id save_batch_pulls refuses.
    const plannedVessel = vessels.find(vessel => vessel.id === plan.batch.planned_vessel_id)?.id ?? "";
    const tabHrefs = { Prep: `/batches/${batch.id}?tab=prep`, "Brew day": `/batches/${batch.id}?tab=brew-day` };
    const shared = { title, backHref: "/batches", ingredients: brewIngredients(plan.plan, plan.pulls, plan.sources, plannedBbl), sources: plan.sources, vesselId: plannedVessel, vessels, planned, note: batch.note ?? undefined };
    const planActions = <ChangePlan kind="batch" id={batch.id} plannedOn={batch.planned_on} />;
    if (openBrewTab(tab, plan.pulls.length > 0) === "prep") return <PrepForm batchId={batch.id} tabHrefs={tabHrefs} planActions={planActions} model={{ ...shared, later: laterAdditions(plan.plan) }} />;
    return <RecordBrewTimelineForm batchId={batch.id} tabHrefs={tabHrefs} planActions={planActions} model={{
      ...shared, targets: brewTargets(plan.plan), waterAdditions: plan.plan.waterAdditions, process: {}, initialBbl: String(plannedBbl), brewedOn: today,
    }} />;
  }
  const confirmedBbl = currentBrewRecords(history.records).reduce((sum, record) => sum + record.initial_bbl, 0);
  const initialBbl = history.records.length ? String(confirmedBbl) : occupancy ? String(Number(occupancy.initial_bbl)) : recorded ? "" : String(plannedBbl);
  const brewedOn = batch.brewed_on ?? (recorded ? "" : today);
  const model = {
    plan: plan.plan, sources: plan.sources, records: history.records, actuals: brewPlanActuals(plan.plan, plannedBbl, plan.sources), process: {}, confirmEmpty: false,
    title, backHref: "/batches",
    // Brewed as planned, the Planned line would only repeat Knockout and Brewed on.
    planned: recorded && brewedAsPlanned({ bbl: plannedBbl, on: batch.planned_on }, { bbl: initialBbl, on: brewedOn }) ? undefined : planned, note: batch.note ?? undefined,
    today, plannedBbl, recorded, cancelled: !!batch.cancelled_at, vesselId: occupancy?.vessel_id ?? "", vesselName: occupancy?.vessel_name, vessels,
    initialBbl, brewedOn,
    completion: batch.closed_at ? { on: formatDate(batch.closed_at, brewery.timeZone), writeOffBbl } : undefined,
  };
  // A recorded batch still in a tank gets that tank's cellar verbs, so its page is not a dead end (#1508).
  const actions = occupancy && <OccupancyActions ctx={ctx} occupancyId={occupancy.id} batch={{ id: batch.id, label: title }} readingHref={`/cellar/${occupancy.id}/reading?from=/batches/${batch.id}`} />;
  return <RecordBrewDayForm key={`${batch.id}:${history.records.length}`} batchId={batch.id} model={model} actions={actions} />;
}
