// lib/mgr/schedule-batch-view.ts — view-model for Schedule batch.
export type ScheduleBatchViewModel = {
  backHref?: string;
  title: string;
  recipe: string;
  recipeOptions: string[];
  brand: string;
  brandOptions: string[];
  plannedBbl: string;
  date: string;
};

export function toScheduleBatchViewProps(s: ScheduleBatchViewModel): ScheduleBatchViewModel {
  return s;
}
