// app/(app)/packaging/page.tsx — Work › Packaging: runs by planned date,
// newest first (list_packaging_runs), each opening its own page to pick a
// tank, start, or close. Schedule run is schedule-run-form.tsx →
// schedule_packaging_run; Repack is repack-form.tsx → record_repack, a
// shape change unrelated to any one run — admin/warehouse only (record_repack's
// own roles), so it is hidden from a brewer rather than offered and refused.
// Repack's parents are the composed SKUs; each one's child SKU and ratio come
// from get_format_composition here, so the sheet derives the outbound leg.
import { PackagingRunsView } from "@/components/mgr/views/packaging-runs";
import { workHrefsFor } from "@/components/mgr/work-tabs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { toPackagingRunsViewProps } from "@/lib/mgr/packaging-runs-view";
import { ScheduleRunForm } from "./schedule-run-form";
import { RepackForm, type RepackParent } from "./repack-form";

type Run = {
  id: string; run_no: number; brand_id: string; occupancy_id: string | null; planned_on: string;
  started_at: string | null; closed_at: string | null; bbl_drawn: number | null;
  brand_name: string | null; vessel_name: string | null; qty_planned: number;
};
type Brand = { id: string; name: string };
type Occupancy = { occupancy_id: string; vessel_name: string | null; brand_name: string | null; bbl: number };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
type Sku = { id: string; name: string; brand_id: string; format_id: string; brands: { name: string } | null; formats: { name: string; bbl_per_unit: number | null } | null; format_volume: { bbl_per_unit: number | null } | null };
type Composition = { components: { child_format_id: string; qty: number }[] };

/** The composed SKUs (format volume derived, none of its own) with the one child SKU each breaks into. */
async function repackParents(skus: Sku[], composition: (formatId: string) => Promise<Composition>): Promise<RepackParent[]> {
  const composed = skus.filter((s) => s.formats && s.formats.bbl_per_unit === null && Number(s.format_volume?.bbl_per_unit) > 0);
  const rows = new Map(await Promise.all([...new Set(composed.map((s) => s.format_id))].map(async (id) => [id, (await composition(id)).components] as const)));
  return composed.map((s) => {
    const components = rows.get(s.format_id) ?? [];
    const child = components.length === 1 ? skus.find((c) => c.brand_id === s.brand_id && c.format_id === components[0].child_format_id) : undefined;
    return {
      id: s.id, label: s.brands ? `${s.brands.name} — ${s.name}` : s.name, unit: s.formats?.name ?? "",
      child: child ? { skuId: child.id, childLabel: child.formats?.name ?? child.name, quantity: Number(components[0].qty), parentBbl: Number(s.format_volume!.bbl_per_unit) } : null,
    };
  });
}

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
  const parents = canRepack ? await repackParents(skus, (formatId) => runCommand("get_format_composition", { formatId }, ctx) as Promise<Composition>) : [];

  return <PackagingRunsView
    model={toPackagingRunsViewProps(runs, (id) => `/packaging/${id}`)}
    workHrefs={workHrefsFor(brewery.role)}
    actions={<div className="flex gap-2"><ScheduleRunForm brands={brands} occupancies={occupancies} skus={skuOptions} />{canRepack ? <RepackForm locations={locations} bins={bins} parents={parents} /> : null}</div>}
  />;
}
