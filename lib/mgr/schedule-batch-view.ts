// lib/mgr/schedule-batch-view.ts — view-model for Schedule batch.
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

export function toScheduleBatchViewProps(s: ScheduleBatchViewModel): ScheduleBatchViewModel {
  return s;
}
