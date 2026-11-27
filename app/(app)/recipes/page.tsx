// app/(app)/recipes/page.tsx — More › Recipes: recipes newest first
// (list_recipes sort newest), each with its brand, the day it was added and whether it is
// written yet; a header click re-sorts by Recipe, Brand or Added. The name opens
// its own recipe page; the back goes to More, New recipe links to /recipes/new and
// the Water profiles row to /catalog/water-profiles?from=recipes, whose back
// then returns here.
// ?q= narrows list_recipes by name, as Catalog's search does.
import { z } from "zod";
import { RecipesView } from "@/components/mgr/views/recipes";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toRecipesViewProps } from "@/lib/mgr/recipes-view";
import "@/lib/commands/all";
import { ListControls } from "@/components/mgr/list-controls";
import { listParams, searchQuery } from "@/lib/mgr/list-params";
import { navTitle } from "@/lib/mgr/nav";
import { formatDate } from "@/lib/date-format";

export const metadata = { title: navTitle("/recipes") };

type Recipe = { id: string; name: string; brand_id: string | null; note: string | null; latest_version: number | null; created_at: string };
type Brand = { id: string; name: string };

const recipesParams = z.object({ q: searchQuery });

export default async function RecipesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const { params } = listParams(recipesParams, (await searchParams) ?? {});
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [recipes, brands] = (await Promise.all([
    runCommand("list_recipes", { ...params, sort: "newest" }, ctx), runCommand("list_brands", {}, ctx),
  ])) as [Recipe[], Brand[]];
  const brandName = (id: string | null) => (id ? brands.find((b) => b.id === id)?.name ?? "—" : null);

  return (
    <RecipesView
      model={toRecipesViewProps({
        backHref: "/more",
        createHref: "/recipes/new",
        waterProfilesHref: "/catalog/water-profiles?from=recipes",
        recipes: recipes.map((r) => ({ id: r.id, name: r.name, brand: brandName(r.brand_id), latest_version: r.latest_version, added: formatDate(r.created_at, brewery.timeZone) })),
        filtered: Boolean(params.q),
      })}
      linkRows
      controls={recipes.length || params.q ? <ListControls resultCount={recipes.length} search={{ label: "Search recipes", value: params.q, keep: {}, path: "/recipes" }} /> : undefined}
    />
  );
}
