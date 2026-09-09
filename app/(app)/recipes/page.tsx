// app/(app)/recipes/page.tsx — More › Recipes: recipes alphabetical
// (list_recipes), each opening its own version-editing page; New recipe is
// new-recipe-form.tsx → create_recipe.
import { E } from "@/components/mgr/e";
import { RecipesView } from "@/components/mgr/views/recipes";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toRecipesViewProps } from "@/lib/mgr/recipes-view";
import "@/lib/commands/all";
import { NewRecipeForm } from "./new-recipe-form";

type Recipe = { id: string; name: string; brand_id: string | null; note: string | null };
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
        recipes: recipes.map((r) => ({ id: r.id, name: r.name, brand: brandName(r.brand_id) })),
      })}
      header={E.hd("Recipes", "brewing process specs", <NewRecipeForm brands={brands} />)}
      linkRows
    />
  );
}
