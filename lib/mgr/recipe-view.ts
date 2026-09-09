// lib/mgr/recipe-view.ts — view-model for Recipe (inventory editor).
export type RecipeIngredientView = { key: string; title: string; detail: string; qty: string };

export type RecipeViewModel = {
  backHref?: string;
  title: string;
  parent?: { title: string; detail: string };
  priceGroup?: string;
  priceGroupOptions?: string[];
  scaleIndex?: number;
  ingredients?: RecipeIngredientView[];
  preBoil?: string;
  boilMin?: string;
  whirlpoolMin?: string;
  whirlpoolTemp?: string;
  whirlpoolRest?: string;
  knockoutTemp?: string;
  efficiency?: string;
  attenuation?: string;
  mash?: { title: string; detail: string };
  fermentation?: { title: string; detail: string };
  water?: { title: string; detail: string };
  notes?: string;
  predicted?: string;
  tape?: [string, string][];
  actualsNote?: string;
};

export function toRecipeViewProps(s: RecipeViewModel): RecipeViewModel {
  return s;
}
