// app/(app)/packaging/page.tsx — Work › Packaging: runs by planned date,
// newest first (list_packaging_runs), each opening its own page to pick a
// tank, start, or close. Schedule run is schedule-run-form.tsx →
// schedule_packaging_run; Repack is repack-form.tsx → record_repack, a
// shape change unrelated to any one run — admin/warehouse only (record_repack's
// own roles), so it is hidden from a brewer rather than offered and refused.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { runNo } from "@/lib/mgr/doc-no";
import { ScheduleRunForm } from "./schedule-run-form";
import { RepackForm } from "./repack-form";

type Run = {
  id: string; run_no: number; brand_id: string; occupancy_id: string | null; planned_on: string;
  started_at: string | null; closed_at: string | null; bbl_drawn: number | null;
  brand_name: string | null; vessel_name: string | null; qty_planned: number;
};
type Brand = { id: string; name: string };
type Occupancy = { occupancy_id: string; vessel_name: string | null; brand_name: string | null; bbl: number };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
type Sku = { id: string; name: string; brands: { name: string } | null };

function verb(run: Run): [string, "info" | "attention" | "success"] {
  if (run.closed_at) return ["Open", "success"];
  if (run.started_at) return ["Close", "attention"];
  if (run.occupancy_id) return ["Start", "info"];
  return ["Pick source", "info"];
}

export default async function PackagingPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [runs, brands, occupancies, locations, bins, skus] = (await Promise.all([
    runCommand("list_packaging_runs", {}, ctx), runCommand("list_brands", {}, ctx), runCommand("list_occupancies", {}, ctx),
    runCommand("list_locations", {}, ctx), runCommand("list_bins", {}, ctx), runCommand("list_skus", {}, ctx),
  ])) as [Run[], Brand[], Occupancy[], Location[], Bin[], Sku[]];
  const skuOptions = skus.map((s) => ({ id: s.id, label: s.brands ? `${s.brands.name} — ${s.name}` : s.name }));
  const canRepack = brewery.role === "admin" || brewery.role === "warehouse";

  return (
    <>
      {E.hd("Packaging", "runs", <div className="flex gap-2"><ScheduleRunForm brands={brands} occupancies={occupancies} skus={skuOptions} />{canRepack ? <RepackForm locations={locations} bins={bins} skus={skuOptions} /> : undefined}</div>)}
      {runs.length === 0
        ? E.blank("No runs planned")
        : runs.map((r) => {
            const [label, tone] = verb(r);
            return (
              <div key={r.id}>
                {E.row(
                  runNo(r.run_no),
                  `${r.brand_name ?? "no brand"} · ${r.planned_on} · ${r.vessel_name ?? "no source yet"} · ${Number(r.qty_planned)} planned`,
                  E.act(label, tone, `/packaging/${r.id}`),
                  r.closed_at ? "ok" : "",
                )}
              </div>
            );
          })}
    </>
  );
}
