// lib/mgr/schedule-batch-view.ts — view-model for Schedule batch, and what
// its Save schedule still needs.
import { submitReason } from "@/lib/mgr/submit-reason";

export type ScheduleBatchViewModel = {
  backHref?: string;
  title: string;
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

/** Only the date and planned barrels commit the slot; brand and recipe are optional intent. */
export function scheduleBatchReason({ date, plannedBbl }: { date: string; plannedBbl: string }): string | null {
  const missing: string[] = [];
  if (!date) missing.push("a date");
  if (!(Number(plannedBbl) > 0)) missing.push("planned barrels above zero");
  return submitReason(missing);
}
