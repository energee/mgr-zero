// lib/mgr/run-closed-view.ts — view-model for Run closed.
export type RunClosedViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  lot?: string;
  output?: string;
  yield?: string;
};

export function toRunClosedViewProps(s: RunClosedViewModel): RunClosedViewModel {
  return s;
}
