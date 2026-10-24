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
  today?: string;
  note: string;
};

/** Only the date and planned barrels commit the slot; brand and recipe are optional intent. */
export function scheduleBatchReason({ date, plannedBbl }: { date: string; plannedBbl: string }): string | null {
  const missing: string[] = [];
  if (!date) missing.push("a date");
  if (!(Number(plannedBbl) > 0)) missing.push("planned barrels above zero");
  return submitReason(missing);
}

/** Planning in the past is legal; distinguish intent from a recorded brew day. */
export function pastPlanWarning(date: string, today?: string): string | undefined {
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= today) return undefined;
  return "This planned date is in the past for your brewery. You can save this plan; it does not record a brew day or change Brewed on.";
}
