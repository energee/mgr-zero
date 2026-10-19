// lib/mgr/run-closed-view.ts — view-model for Run closed.
import type { PackagingActualDraft, PackagingMaterialRecord } from "./packaging-actuals";
import type { PackagingCloseFieldsModel } from "./close-packaging-run-view";
export type RunClosedViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  bblDrawn?: number | null;
  lot?: { id: string; code: string; packaged_on: string; best_by: string | null } | null;
  outputs?: { sku_id: string; sku_name: string | null; qty_actual: number | null }[];
  records?: PackagingMaterialRecord[];
  /** breweries.timezone: a record's created_at is printed as the day it falls on there. */
  timeZone: string;
  correction?: Pick<PackagingCloseFieldsModel, "plan" | "locations" | "bins"> & { rows: PackagingActualDraft[]; reason: string };
};
