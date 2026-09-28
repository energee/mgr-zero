// lib/mgr/run-closed-view.ts — view-model for Run closed.
import type { PackagingActualDraft, PackagingMaterialRecord } from "./packaging-actuals";
import type { PackagingCloseFieldsModel } from "./close-packaging-run-view";
export type RunClosedViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  lot?: string;
  output?: string;
  yield?: string;
  records?: PackagingMaterialRecord[];
  correction?: Pick<PackagingCloseFieldsModel, "plan" | "locations" | "bins"> & { rows: PackagingActualDraft[]; reason: string };
};
