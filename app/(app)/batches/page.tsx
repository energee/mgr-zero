// app/(app)/batches/page.tsx — Work › Batches: planned and brewed batches
// (list_batches), each opening its brew day; New batch is
// new-batch-form.tsx → schedule_batch. Vessels are managed inline here
// (upsert_vessel via vessel-form.tsx) since they exist only to be picked at
// brew day and in the cellar, never as their own tab.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { batNo } from "@/lib/mgr/doc-no";
import { NewBatchForm } from "./new-batch-form";
import { VesselForm } from "./vessel-form";

type Batch = {
  id: string; batch_no: number | null; planned_on: string; planned_bbl: number; brewed_on: string | null;
  brand_name: string | null; recipe_name: string | null; vessel_name: string | null;
};
type Brand = { id: string; name: string };
type Recipe = { id: string; name: string; latest_version_id: string | null; latest_version: number | null };
type Vessel = { id: string; name: string; kind: string; capacity_bbl: number; active: boolean };

export default async function BatchesPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [batches, brands, recipes, vessels] = (await Promise.all([
    runCommand("list_batches", {}, ctx), runCommand("list_brands", {}, ctx),
    runCommand("list_recipes", {}, ctx), runCommand("list_vessels", {}, ctx),
  ])) as [Batch[], Brand[], Recipe[], Vessel[]];

  // schedule_batch names a recipe *version*; list_recipes carries each
  // recipe's latest one, and a recipe with no version yet cannot be brewed.
  const recipeVersions = recipes.flatMap((r) =>
    r.latest_version_id ? [{ id: r.latest_version_id, label: `${r.name} v${r.latest_version}` }] : []);

  return (
    <>
      {E.hd("Batches", "brewed and planned", <NewBatchForm brands={brands} recipeVersions={recipeVersions} />)}
      {batches.length === 0
        ? E.blank("No batches yet")
        : batches.map((b) => (
            <div key={b.id}>
              {E.row(
                batNo(b.batch_no),
                `${b.brand_name ?? "no brand yet"} · ${b.recipe_name ?? "no recipe"} · ${Number(b.planned_bbl)} bbl · ${b.planned_on}${b.vessel_name ? ` · ${b.vessel_name}` : ""}`,
                E.act(b.brewed_on ? "Open" : "Brew", b.brewed_on ? "primary" : "info", `/batches/${b.id}`),
                b.brewed_on ? "ok" : "",
              )}
            </div>
          ))}
      {E.sp()}
      {E.ttl("Vessels")}
      <VesselForm />
      {vessels.length === 0
        ? E.blank("No vessels yet")
        : vessels.map((v) => (
            <div key={v.id}>
              {E.row(v.name, `${v.kind} · ${Number(v.capacity_bbl)} bbl`, <VesselForm vessel={v} />)}
            </div>
          ))}
    </>
  );
}
