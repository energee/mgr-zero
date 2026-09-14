// app/(app)/recipes/new/page.tsx — New recipe: the Recipe surface with the
// parent form in its detail slot (components/mgr/views/new-recipe.tsx).
// Reads list_brands for the optional brand; ../new-recipe-form.tsx writes.
import { RecipeView } from "@/components/mgr/views/recipe";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { NewRecipeForm } from "../new-recipe-form";

type Brand = { id: string; name: string };

export default async function NewRecipePage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const brands = (await runCommand("list_brands", {}, ctx)) as Brand[];
  return <RecipeView model={{ title: "New recipe", backHref: "/recipes" }} detail={<NewRecipeForm brands={brands.map(({ id, name }) => ({ id, name }))} />} />;
}
