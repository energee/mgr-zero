// app/(app)/batches/[id]/page.tsx — one batch: planned facts, and either the
// occupancy it landed in (brewed) or record-brew-day-form.tsx (planned).
// get_brew_day is the read; only open vessels not already occupied make
// sense to offer, but record_brew_day itself is the one place that refuses
// an overlap, so every vessel is offered here.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { batNo } from "@/lib/mgr/doc-no";
import { RecordBrewDayForm } from "./record-brew-day-form";

type Batch = {
  id: string; batch_no: number | null; intended_brand_id: string | null; recipe_version_id: string | null;
  planned_on: string; planned_bbl: number; brewed_on: string | null; note: string | null;
};
type Occupancy = { id: string; vessel_id: string; initial_bbl: number; started_at: string; vessel_name: string };
type Vessel = { id: string; name: string; kind: string; capacity_bbl: number };

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ batch, occupancy }, vessels] = (await Promise.all([
    orNotFound(runCommand("get_brew_day", { batchId: id }, ctx)),
    runCommand("list_vessels", {}, ctx),
  ])) as [{ batch: Batch; occupancy: Occupancy | null }, Vessel[]];

  return (
    <>
      {E.back("Batches", batNo(batch.batch_no))}
      {E.fld("Planned", `${Number(batch.planned_bbl)} bbl · ${batch.planned_on}`)}
      {batch.note ? E.fld("Note", batch.note) : null}
      {occupancy ? (
        <>
          {E.fld("Vessel", occupancy.vessel_name)}
          {E.fld("Knockout", `${Number(occupancy.initial_bbl)} bbl`)}
          {E.fld("Brewed on", batch.brewed_on ?? "—")}
          {E.info("Brewed: this batch is sitting in its vessel. Cellar transfers and fermentation readings continue from there.")}
        </>
      ) : (
        <>
          {E.sp()}
          <RecordBrewDayForm batchId={batch.id} plannedBbl={Number(batch.planned_bbl)} vessels={vessels} />
        </>
      )}
    </>
  );
}
