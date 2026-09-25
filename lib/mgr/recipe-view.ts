// lib/mgr/recipe-view.ts — view-model for Recipe: the inventory editor and
// the live page (read-out of a cut version, or the draft editor).
import type { ReactNode } from "react";
/** `action` (a live Edit) draws in place of `qty` when the page is a draft. */
export type RecipeIngredientView = { key: string; title: string; detail: string; qty: string; action?: ReactNode };

/** Input bounds mirroring create_recipe_version, so the browser refuses a
 * decimal minute or a zero volume before the command answers with a raw
 * validation error (#447). Pre-boil must be positive; 0.01 bbl stands in for
 * the exclusive minimum a number field cannot express. */
const WHOLE_MINUTES = { min: 1, step: 1 } as const;
const WHOLE_MINUTES_OR_NONE = { min: 0, step: 1 } as const;

/** The eight process numbers drawn in one grid, in drawing order, with their bounds. */
export const RECIPE_NUMBERS = [
  ["preBoil", "Pre-boil volume bbl", { min: 0.01 }], ["boilMin", "Boil time min", WHOLE_MINUTES], ["whirlpoolMin", "Whirlpool min", WHOLE_MINUTES_OR_NONE], ["whirlpoolTemp", "Whirlpool temp °F", {}],
  ["whirlpoolRest", "Whirlpool rest min", WHOLE_MINUTES_OR_NONE], ["knockoutTemp", "Knockout temp °F", {}], ["efficiency", "Brewhouse efficiency %", {}], ["attenuation", "Yeast attenuation %", {}],
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
