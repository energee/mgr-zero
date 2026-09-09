// app/(app)/cellar/page.tsx — Beer › Cellar: tanks with beer in them right
// now (list_occupancies), each opening its reading log; Transfer is
// cellar-transfer-form.tsx → record_cellar_transfer.
import { E } from "@/components/mgr/e";
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
  const [occupancies, vessels, batches] = (await Promise.all([
    runCommand("list_occupancies", {}, ctx), runCommand("list_vessels", {}, ctx), runCommand("list_batches", {}, ctx),
  ])) as [Occupancy[], Vessel[], Batch[]];
  const completionCandidates = batches.filter((batch) => batch.brewed_on !== null && batch.closed_at === null)
    .map((batch) => ({ id: batch.id, label: `Batch ${batch.batch_no ?? "—"} · ${batch.brand_name ?? "no brand"}` }));

  return (
    <>
      {E.hd("Cellar", "occupied tanks", <div className="flex gap-2"><BatchCompletionForm batches={completionCandidates} /><CellarTransferForm occupancies={occupancies} vessels={vessels} /></div>)}
      {occupancies.length === 0
        ? E.blank("No tanks occupied")
        : occupancies.map((o) => (
            <div key={o.occupancy_id}>
              {E.row(
                o.vessel_name ?? "—",
                `${o.brand_name ?? "no brand yet"} · ${Number(o.bbl)} bbl · since ${o.started_at.slice(0, 10)}`,
                E.act("Reading", "info", `/cellar/${o.occupancy_id}/reading`),
              )}
            </div>
          ))}
    </>
  );
}
