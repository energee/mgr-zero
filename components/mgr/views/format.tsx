// components/mgr/views/format.tsx — Format sheet drawing (inventory). Live
// create stays format-form.tsx: E.edit is not a controlled CommandForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { FormatViewModel } from "@/lib/mgr/format-view";

export type { FormatViewModel };

export function FormatView({
  model,
  createAction,
  footer,
}: {
  model: FormatViewModel;
  createAction?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      {createAction}
      {E.edit("Format name", model.name)}
      {E.fld("Basis", model.basis)}
      {E.info("Create a brand-owned glass using New pour beside its brand in Catalog.")}
      {E.pick("Package", model.packageType, model.packageOptions)}
      {E.volume(model.volumeValue, model.volumeUnits, model.volumeUnitIndex)}
      {E.info(model.composedInfo)}
      {E.ttl("Packaging BOM")}
      {E.tbl(
        ["Material", "Qty", "On break"],
        model.bom.map((line) => [line.material, line.qty, line.onBreak]),
      )}
      {E.info(model.bomInfo)}
      {footer !== undefined ? footer : E.btn("Save format")}
    </>
  );
}
