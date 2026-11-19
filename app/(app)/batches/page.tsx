// Batches and vessel reads remain at their existing authorized command boundary.
// ?recipe=<recipe id> (the Recipe page's Schedule batch, #1581) opens New batch
// on that recipe as last saved.
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { BatchesView } from "@/components/mgr/views/batches";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { canRun } from "@/lib/commands/registry";
import { toBatchesViewProps, batchesFromQuery, type BatchListRow, type BatchVessel } from "@/lib/mgr/batches-view";
import { workHrefsFor } from "@/components/mgr/work-tabs";
import "@/lib/commands/all";
import { NewBatchForm } from "./new-batch-form";
import { navTitle } from "@/lib/mgr/nav";
import { breweryDate } from "@/lib/date-format";
import { numberedHistoryPage, pageNumber, pageSize, type NumberedHistoryPage, type HistoryRow } from "@/lib/mgr/history-page";

export const metadata = { title: navTitle("/batches") };

type Brand = { id: string; name: string };
type Recipe = { id: string; name: string; brand_id: string | null; latest_version_id: string | null };

export default async function BatchesPage({ searchParams }: { searchParams: Promise<{ recipe?: string; completedPage?: string | string[]; cancelledPage?: string | string[]; completedLimit?: string | string[]; cancelledLimit?: string | string[] }> }) {
  const [params, brewery] = await Promise.all([searchParams, getActiveBrewery()]);
  const { recipe: linkedRecipe } = params;
  const completedPageNumber = pageNumber(params.completedPage);
  const cancelledPageNumber = pageNumber(params.cancelledPage);
  const completedLimit = pageSize(params.completedLimit);
  const cancelledLimit = pageSize(params.cancelledLimit);
  const ctx = await buildContext(brewery.id);
  const [planned, active, completed, cancelled, brands, recipes, vessels, gravity] = (await Promise.all([
    runCommand("list_batches", { open: false }, ctx), runCommand("list_batches", { readings: true, open: true }, ctx),
    runCommand("list_batch_history", { status: "completed", page: completedPageNumber, limit: completedLimit }, ctx),
    runCommand("list_batch_history", { status: "cancelled", page: cancelledPageNumber, limit: cancelledLimit }, ctx),
    runCommand("list_brands", {}, ctx), runCommand("list_recipes", {}, ctx),
    runCommand("list_vessels", { retired: true }, ctx), runCommand("get_gravity_unit", {}, ctx),
  ])) as [BatchListRow[], BatchListRow[], NumberedHistoryPage<BatchListRow & HistoryRow>, NumberedHistoryPage<BatchListRow & HistoryRow>, Brand[], Recipe[], BatchVessel[], { effective: GravityUnit }];
  const completedPage = numberedHistoryPage(completed, "/batches", completedPageNumber, completedLimit, { recipe: linkedRecipe, cancelledPage: params.cancelledPage === undefined ? undefined : String(cancelledPageNumber), cancelledLimit: params.cancelledLimit === undefined ? undefined : String(cancelledLimit) }, "completedPage");
  const cancelledPage = numberedHistoryPage(cancelled, "/batches", cancelledPageNumber, cancelledLimit, { recipe: linkedRecipe, completedPage: params.completedPage === undefined ? undefined : String(completedPageNumber), completedLimit: params.completedLimit === undefined ? undefined : String(completedLimit) }, "cancelledPage");
  const recipeVersions = recipes.flatMap(recipe =>
    recipe.latest_version_id ? [{ id: recipe.latest_version_id, label: recipe.name, brandId: recipe.brand_id }] : []);
  const today = breweryDate(brewery.timeZone);
  // A link naming no listed recipe, or one without a version, opens nothing: the page reads as plain Batches.
  const linkedVersionId = recipes.find(recipe => recipe.id === linkedRecipe)?.latest_version_id ?? undefined;
  return <BatchesView model={toBatchesViewProps(batchesFromQuery([...planned, ...active, ...completed.rows, ...cancelled.rows], vessels, { batch: id => `/batches/${id}`, vessel: id => `/cellar/vessels/${id}`, reading: id => `/cellar/${id}/reading?from=/batches` }, { unit: gravity.effective, today }))}
    completedPagination={completedPage.pagination} cancelledPagination={cancelledPage.pagination} cancelledOpen={params.cancelledPage !== undefined || params.cancelledLimit !== undefined}
    createAction={<NewBatchForm recipeVersionId={linkedVersionId} brands={brands} recipeVersions={recipeVersions} today={today} brandsHref={canRun(ctx, "upsert_brand") ? "/catalog" : null} />}
    workHrefs={workHrefsFor(brewery.roles)}
    newVesselHref={canRun(ctx, "upsert_vessel") ? "/cellar/vessels/new" : null}
  />;
}
