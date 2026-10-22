// lib/mgr/schedule-batch-view.ts — view-model for the New batch sheet.
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
