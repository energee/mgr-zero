// components/mgr/views/run-closed.tsx — committed lot, actual output and material history.
import type { ReactNode } from "react";
import { PackagingMaterialHistory, PackagingMaterialCorrection } from "./packaging-materials";
import { E } from "@/components/mgr/e";
import type { RunClosedViewModel } from "@/lib/mgr/run-closed-view";

export type { RunClosedViewModel };

export function RunClosedView({
  model,
  action,
}: {
  model: RunClosedViewModel;
  action?: ReactNode | null;
}) {
  return (
    <>
      {E.back(model.backTo ?? "Work", model.title, undefined, model.backHref)}
      {model.bblDrawn !== undefined ? E.fld("Barrels drawn", model.bblDrawn === null ? "Not recorded" : model.bblDrawn) : null}
      {model.lot !== undefined ? <>
        {E.fld("Lot", model.lot?.code ?? "Not recorded")}
        {model.lot ? E.fld("Packaged on", model.lot.packaged_on) : null}
        {model.lot?.best_by ? E.fld("Best by", model.lot.best_by) : null}
      </> : null}
      {model.outputs ? <>
        {E.ttl("Actual outputs")}
        {model.outputs.length ? E.tbl(["SKU", "Actual quantity"], model.outputs.map(row => [
          row.sku_name ?? row.sku_id, row.qty_actual === null ? "Not recorded" : row.qty_actual,
        ]), ["l", "r"]) : E.info("No outputs recorded.")}
      </> : null}
      {model.records ? <PackagingMaterialHistory records={model.records} /> : null}
      {model.correction ? <PackagingMaterialCorrection {...model.correction} /> : null}
      {action}
    </>
  );
}
