// lib/mgr/schedule-batch-view.ts — view-model for the New batch sheet, and
// what its Schedule batch still needs.
import { submitReason } from "@/lib/mgr/submit-reason";

export type ScheduleBatchViewModel = {
  recipeId?: string;
  recipe: string;
  recipeOptions: { id: string; label: string }[];
  brandId?: string;
  brand: string;
  brandOptions: { id: string; label: string }[];
  plannedBbl: string;
  date: string;
  note: string;
};

/** Mirrors schedule_batch's positive numeric(10,3) barrel bounds. */
export function plannedBarrelsError(value: string): string | undefined {
  if (/[eE]/.test(value)) return "Enter a decimal number without exponent notation.";
  const barrels = Number(value);
  if (!Number.isFinite(barrels) || barrels <= 0) return "Enter planned barrels above zero.";
  if (barrels > 9_999_999.999) return "Enter at most 9,999,999.999 barrels.";
}

/** Only the date and planned barrels commit the slot; brand and recipe are optional intent. */
export function scheduleBatchReason({ date, plannedBbl }: { date: string; plannedBbl: string }): string | null {
  const missing: string[] = [];
  if (!date) missing.push("a date");
  if (plannedBarrelsError(plannedBbl)) missing.push("planned barrels above zero");
  return submitReason(missing);
}
