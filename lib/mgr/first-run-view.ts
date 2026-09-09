// lib/mgr/first-run-view.ts — view-model for First-run checklist.
export type FirstRunViewModel = {
  brewery: string;
  steps: string;
};

export function toFirstRunViewProps(s: FirstRunViewModel): FirstRunViewModel {
  return s;
}
