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

export type RecipeScheduleView = { title: string; detail: string; rows?: { title: string; detail: string }[] };

export type RecipeViewModel = {
  backHref?: string;
  /** The back link's text; "Recipes" unless the page sits under a recipe (the draft). */
  backLabel?: string;
  /** Where Create recipe version goes on a cut version; the draft editor submits instead. */
  createHref?: string;
  /** A recipe with no version yet: drawn instead of the editor, so no number is invented. */
  empty?: string;
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
  /** A schedule row; `rows` present means it is read out inline (a cut version) instead of opening. */
  mash?: RecipeScheduleView;
  fermentation?: RecipeScheduleView;
  water?: RecipeScheduleView;
  notes?: string;
  predicted?: string;
  tape?: [string, string][];
  actualsNote?: string;
};
