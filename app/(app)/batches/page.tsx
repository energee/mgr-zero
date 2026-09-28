// Batches and vessel reads remain at their existing authorized command boundary.
import type { GravityUnit } from "@/lib/mgr/gravity-unit";
import { BatchesView } from "@/components/mgr/views/batches";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toBatchesViewProps, batchesFromQuery, type BatchListRow, type BatchVessel } from "@/lib/mgr/batches-view";
import { workHrefsFor } from "@/components/mgr/work-tabs";
import "@/lib/commands/all";
import { NewBatchForm } from "./new-batch-form";

type Brand = { id: string; name: string };
type Recipe = { id: string; name: string; latest_version_id: string | null; latest_version: number | null };

export default async function BatchesPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [batches, brands, recipes, vessels, gravity] = (await Promise.all([
    runCommand("list_batches", { readings: true }, ctx), runCommand("list_brands", {}, ctx),
    runCommand("list_recipes", {}, ctx), runCommand("list_vessels", {}, ctx), runCommand("get_gravity_unit", {}, ctx),
  ])) as [BatchListRow[], Brand[], Recipe[], BatchVessel[], { effective: GravityUnit }];
  const recipeVersions = recipes.flatMap(recipe =>
    recipe.latest_version_id ? [{ id: recipe.latest_version_id, label: recipe.name + " v" + recipe.latest_version }] : []);
  return <BatchesView model={toBatchesViewProps(batchesFromQuery(batches, vessels, { batch: id => `/batches/${id}`, vessel: id => `/cellar/vessels/${id}`, reading: id => `/cellar/${id}/reading` }, { unit: gravity.effective, timeZone: brewery.timeZone }))}
    createAction={<NewBatchForm brands={brands} recipeVersions={recipeVersions} />}
    workHrefs={workHrefsFor(brewery.role)}
    newVesselHref="/cellar/vessels/new"
  />;
}
