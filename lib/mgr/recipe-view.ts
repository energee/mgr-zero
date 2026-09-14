// lib/mgr/recipe-view.ts — view-model for Recipe: the inventory editor and
// the live page (read-out of a cut version, or the draft editor).
import type { ReactNode } from "react";
/** `action` (a live Edit) draws in place of `qty` when the page is a draft. */
export type RecipeIngredientView = { key: string; title: string; detail: string; qty: string; action?: ReactNode };

/** The eight process numbers drawn in one grid, in drawing order. */
export const RECIPE_NUMBERS = [
  ["preBoil", "Pre-boil volume bbl"], ["boilMin", "Boil time min"], ["whirlpoolMin", "Whirlpool min"], ["whirlpoolTemp", "Whirlpool temp °F"],
  ["whirlpoolRest", "Whirlpool rest min"], ["knockoutTemp", "Knockout temp °F"], ["efficiency", "Brewhouse efficiency %"], ["attenuation", "Yeast attenuation %"],
] as const;
export type RecipeNumberKey = (typeof RECIPE_NUMBERS)[number][0];

export type RecipeViewModel = {
  backHref?: string;
  /** Where Create recipe version goes on a cut version; the draft editor submits instead. */
  createHref?: string;
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
