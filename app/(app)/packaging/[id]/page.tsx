// app/(app)/packaging/[id]/page.tsx — one packaging run: planned facts and
// its planned outputs, with the one next action for its state (run-actions.tsx):
// pick a tank, start, or close. get_packaging_run is the read.
import { E } from "@/components/mgr/e";
import { ClosePackagingRunView } from "@/components/mgr/views/close-packaging-run";
import { RunClosedView } from "@/components/mgr/views/run-closed";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toClosePackagingRunViewProps } from "@/lib/mgr/close-packaging-run-view";
import { toRunClosedViewProps } from "@/lib/mgr/run-closed-view";
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
  const { run, outputs } = (await orNotFound(runCommand("get_packaging_run", { runId: id }, ctx))) as { run: Run; outputs: Output[] };
  const picking = !run.closed_at && !run.occupancy_id;
  const closing = !run.closed_at && !!run.started_at;
  const [occupancies, locations, bins] = (await Promise.all([
    picking ? runCommand("list_occupancies", {}, ctx) : [],
    closing ? runCommand("list_locations", {}, ctx) : [],
    closing ? runCommand("list_bins", {}, ctx) : [],
  ])) as [Occupancy[], Location[], Bin[]];

  const title = runNo(run.run_no);
  if (run.closed_at) {
    return (
      <RunClosedView
        model={toRunClosedViewProps({ title, backTo: "Packaging", backHref: "/packaging" })}
        fields={
          <>
            {E.fld("Barrels drawn", run.bbl_drawn === null ? "—" : Number(run.bbl_drawn))}
            {E.info("Closed: lot, finished goods and material consumption are on the ledger.")}
          </>
        }
        action={null}
      />
    );
  }
  return (
    <ClosePackagingRunView
      model={toClosePackagingRunViewProps({ title, backTo: "Packaging", backHref: "/packaging" })}
      lead={
        <>
          {E.fld("Brand", run.brand_name ?? "—")}
          {E.fld("Planned", run.planned_on)}
          {E.fld("Source", run.vessel_name ?? "no source yet")}
          {E.ttl("Planned outputs")}
          {E.tbl(["SKU", "planned", "actual"], outputs.map((o) => [o.sku_name ?? o.sku_id.slice(0, 8), Number(o.qty_planned), o.qty_actual === null ? "—" : Number(o.qty_actual)]))}
        </>
      }
      review={null}
      action={
        <>
          {E.sp()}
          {!run.occupancy_id
            ? <PickTankForm runId={run.id} occupancies={occupancies} />
            : !run.started_at
              ? <StartRunButton runId={run.id} />
              : <CloseRunForm runId={run.id} outputs={outputs} locations={locations} bins={bins} />}
        </>
      }
    />
  );
}
