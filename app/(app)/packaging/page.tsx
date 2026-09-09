// app/(app)/packaging/page.tsx — Work › Packaging: runs by planned date,
// newest first (list_packaging_runs), each opening its own page to pick a
// tank, start, or close. Schedule run is schedule-run-form.tsx →
// schedule_packaging_run; Repack is repack-form.tsx → record_repack, a
// shape change unrelated to any one run — admin/warehouse only (record_repack's
// own roles), so it is hidden from a brewer rather than offered and refused.
import { PackagingRunsView } from "@/components/mgr/views/packaging-runs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { toPackagingRunsViewProps } from "@/lib/mgr/packaging-runs-view";
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

export default async function PackagingPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canRepack = brewery.role === "admin" || brewery.role === "warehouse";
  const [runs, brands, occupancies, skus, locations, bins] = (await Promise.all([
    runCommand("list_packaging_runs", {}, ctx), runCommand("list_brands", {}, ctx), runCommand("list_occupancies", {}, ctx),
    runCommand("list_skus", {}, ctx),
    // Only the repack form needs these; a brewer never sees it.
    canRepack ? runCommand("list_locations", {}, ctx) : [], canRepack ? runCommand("list_bins", {}, ctx) : [],
  ])) as [Run[], Brand[], Occupancy[], Sku[], Location[], Bin[]];
  const skuOptions = skus.map((s) => ({ id: s.id, label: s.brands ? `${s.brands.name} — ${s.name}` : s.name }));

  return <PackagingRunsView
    model={toPackagingRunsViewProps(runs, (id) => `/packaging/${id}`)}
    tabs={null}
    actions={<div className="flex gap-2"><ScheduleRunForm brands={brands} occupancies={occupancies} skus={skuOptions} />{canRepack ? <RepackForm locations={locations} bins={bins} skus={skuOptions} /> : null}</div>}
  />;
}
