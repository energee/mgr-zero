// app/(app)/packaging/page.tsx — Work › Packaging: unfinished runs soonest
// first (list_packaging_runs) and a page of finished ones grouped by planned
// day (list_packaging_history), each opening its own page to pick a tank,
// start, or close. Ready to package is list_occupancies({ readyToPackage }):
// each tank's Schedule link is ?schedule=<occupancy>, which opens the sheet on
// that tank. Schedule run is schedule-run-form.tsx →
// schedule_packaging_run, fed the brands, open tanks and SKUs read here;
// Repack is repack-form.tsx → record_repack, a shape change unrelated to any
// one run — admin/warehouse only (record_repack's own roles), so it is hidden
// from a brewer rather than offered and refused.
// Repack's parents come from list_repack_parents: each composed SKU with the
// child it breaks into, so the sheet derives the outbound leg. With none, its
// Break note links Catalog only for a user who may set a format's contents.
import { PackagingRunsView } from "@/components/mgr/views/packaging-runs";
import { workHrefsFor } from "@/components/mgr/work-tabs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { canRun } from "@/lib/commands/registry";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { toPackagingRunsViewProps, toReadyToPackage, type PackagingRunSnapshot, type ReadyTank } from "@/lib/mgr/packaging-runs-view";
import type { ScheduleRunData } from "@/lib/mgr/schedule-packaging-run-view";
import { ScheduleRunForm } from "./schedule-run-form";
import { RepackForm, type RepackParent } from "./repack-form";
import { navTitle } from "@/lib/mgr/nav";
import { breweryDate } from "@/lib/date-format";
import { numberedHistoryPage, pageNumber, pageSize, type NumberedHistoryPage, type HistoryRow } from "@/lib/mgr/history-page";

export const metadata = { title: navTitle("/packaging") };

type Run = PackagingRunSnapshot;
type Brand = { id: string; name: string };
type Occupancy = ScheduleRunData["occupancies"][number];
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
type Sku = ScheduleRunData["skus"][number];

export default async function PackagingPage({ searchParams }: { searchParams: Promise<{ repack?: string; schedule?: string; page?: string | string[]; limit?: string | string[] }> }) {
  const { repack, schedule, page: rawPage, limit: rawLimit } = await searchParams;
  const currentPage = pageNumber(rawPage);
  const limit = pageSize(rawLimit);
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const canRepack = brewery.roles.includes("admin") || brewery.roles.includes("warehouse");
  const [runs, recent, brands, occupancies, ready, skus, locations, bins, parents] = (await Promise.all([
    runCommand("list_packaging_runs", {}, ctx), runCommand("list_packaging_history", { page: currentPage, limit }, ctx),
    runCommand("list_brands", {}, ctx), runCommand("list_occupancies", {}, ctx),
    runCommand("list_occupancies", { readyToPackage: true }, ctx),
    runCommand("list_skus", {}, ctx),
    // Only the repack form needs these; a brewer never sees it.
    canRepack ? runCommand("list_locations", {}, ctx) : [], canRepack ? runCommand("list_bins", {}, ctx) : [],
    canRepack ? runCommand("list_repack_parents", {}, ctx) : [],
  ])) as [Run[], NumberedHistoryPage<Run & HistoryRow>, Brand[], Occupancy[], ReadyTank[], Sku[], Location[], Bin[], RepackParent[]];
  const page = numberedHistoryPage(recent, "/packaging", currentPage, limit);
  return <PackagingRunsView
    model={toPackagingRunsViewProps([...runs, ...page.rows], brewery.timeZone, (id) => `/packaging/${id}`)} pagination={page.pagination}
    ready={toReadyToPackage(ready, (id) => `/packaging?schedule=${id}`)}
    workHrefs={workHrefsFor(brewery.roles)}
    actions={<div className="flex gap-2"><ScheduleRunForm key={schedule} sourceOccupancyId={schedule} brands={brands} occupancies={occupancies} skus={skus} today={breweryDate(brewery.timeZone)} catalogHref={canRun(ctx, "create_sku") ? "/catalog" : null} />{canRepack ? <RepackForm autoOpen={repack === "1"} locations={locations} bins={bins} parents={parents} formatsHref={canRun(ctx, "create_composed_format") ? "/catalog" : null} /> : null}</div>}
  />;
}
