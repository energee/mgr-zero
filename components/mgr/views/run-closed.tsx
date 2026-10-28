// components/mgr/views/run-closed.tsx — a closed run's planned facts and close day, committed lot, actual output and material history.
import type { ReactNode } from "react";
import { PackagingMaterialHistory, PackagingMaterialCorrection } from "./packaging-materials";
import { E } from "@/components/mgr/e";
import { formatDate } from "@/lib/date-format";
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
      {E.back(model.backTo ?? "Packaging", model.title, undefined, model.backHref, "Packaging runs")}
      {E.fld("Brand", model.brand)}
      {E.fld("Source", model.source)}
      {E.fld("Planned", formatDate(model.plannedOn))}
      {E.fld("Closed", formatDate(model.closedAt, model.timeZone))}
      {model.bblDrawn !== undefined ? E.fld("Barrels drawn", model.bblDrawn === null ? "Not recorded" : model.bblDrawn) : null}
      {model.lot !== undefined ? <>
        {E.fld("Lot", model.lot?.code ?? "Not recorded")}
        {model.lot ? E.fld("Packaged on", formatDate(model.lot.packaged_on)) : null}
        {model.lot?.best_by ? E.fld("Best by", formatDate(model.lot.best_by)) : null}
      </> : null}
      {model.outputs ? <>
        {E.ttl("Actual outputs")}
        {model.outputs.length ? E.tbl(["SKU", "Actual quantity"], model.outputs.map(row => [
          row.sku_name ?? row.sku_id, row.qty_actual === null ? "Not recorded" : row.qty_actual,
        ]), ["l", "r"]) : E.info("No outputs recorded.")}
      </> : null}
      {model.records ? <PackagingMaterialHistory records={model.records} timeZone={model.timeZone} /> : null}
      {model.correction ? <PackagingMaterialCorrection {...model.correction} /> : null}
      {action}
    </>
  );
}
