// Batches and vessel reads remain at their existing authorized command boundary.
import { BatchesView } from "@/components/mgr/views/batches";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toBatchesViewProps, batchesFromQuery, type BatchListRow, type BatchVessel } from "@/lib/mgr/batches-view";
import { navFor, STAFF_NAV } from "@/lib/mgr/nav";
import { WORK_CHIPS } from "@/components/mgr/work-tabs";
import "@/lib/commands/all";
import { NewBatchForm } from "./new-batch-form";

type Brand = { id: string; name: string };
type Recipe = { id: string; name: string; latest_version_id: string | null; latest_version: number | null };

export default async function BatchesPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [batches, brands, recipes, vessels] = (await Promise.all([
    runCommand("list_batches", {}, ctx), runCommand("list_brands", {}, ctx),
    runCommand("list_recipes", {}, ctx), runCommand("list_vessels", {}, ctx),
  ])) as [BatchListRow[], Brand[], Recipe[], BatchVessel[]];
  const recipeVersions = recipes.flatMap(recipe =>
    recipe.latest_version_id ? [{ id: recipe.latest_version_id, label: recipe.name + " v" + recipe.latest_version }] : []);
  const work = navFor(STAFF_NAV, brewery.role).find(item => item.href === "/work");
  const allowed = new Set([work?.href, ...work?.children?.map(item => item.href) ?? []]);
  return <BatchesView model={toBatchesViewProps(batchesFromQuery(batches, vessels, { batch: id => `/batches/${id}`, vessel: id => `/cellar/vessels/${id}` }))}
    createAction={<NewBatchForm brands={brands} recipeVersions={recipeVersions} />}
    workHrefs={Object.fromEntries(WORK_CHIPS.filter(([, href]) => allowed.has(href)))}
    newVesselHref="/cellar/vessels/new"
  />;
}
