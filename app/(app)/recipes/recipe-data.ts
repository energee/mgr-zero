import { cache } from "react";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery } from "@/lib/mgr/page-query";
import { orNotFound } from "@/lib/mgr/not-found";
import type { RecipeSnapshot } from "@/lib/mgr/recipe-view";
import "@/lib/commands/all";

/** Share the authorized record read between the page and its metadata within one request. */
export const getRecipePageData = cache(async function getRecipePageData(id: string, version?: number) {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const snapshot = await orNotFound(runPageQuery("get_recipe", { recipeId: id, version }, ctx)) as RecipeSnapshot;
  return { brewery, ctx, snapshot };
});
