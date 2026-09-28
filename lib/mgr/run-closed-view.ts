// lib/mgr/run-closed-view.ts — view-model for Run closed.
export type RunClosedViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  lot?: string;
  output?: string;
  yield?: string;
  records?: import("./packaging-actuals").PackagingMaterialRecord[];
  correction?: Pick<import("./close-packaging-run-view").PackagingCloseFieldsModel,"plan" | "locations" | "bins"> & { rows: import("./packaging-actuals").PackagingActualDraft[]; reason: string };
};
