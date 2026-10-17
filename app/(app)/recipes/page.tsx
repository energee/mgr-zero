// app/(app)/recipes/page.tsx — More › Recipes: recipes alphabetical
// (list_recipes), each titled with its current version and opening its own
// recipe page; the back goes to More and New recipe links to /recipes/new.
import { RecipesView } from "@/components/mgr/views/recipes";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toRecipesViewProps } from "@/lib/mgr/recipes-view";
import "@/lib/commands/all";

type Recipe = { id: string; name: string; brand_id: string | null; note: string | null; latest_version: number | null };
type Brand = { id: string; name: string };

export default async function RecipesPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [recipes, brands] = (await Promise.all([
    runCommand("list_recipes", {}, ctx), runCommand("list_brands", {}, ctx),
  ])) as [Recipe[], Brand[]];
  const brandName = (id: string | null) => (id ? brands.find((b) => b.id === id)?.name ?? "—" : null);

  return (
    <RecipesView
      model={toRecipesViewProps({
        backHref: "/more",
        createHref: "/recipes/new",
        recipes: recipes.map((r) => ({ id: r.id, name: r.name, brand: brandName(r.brand_id), latest_version: r.latest_version })),
      })}
    />
  );
}
