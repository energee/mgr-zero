// components/mgr/views/material.tsx — Material inventory sheet. Live stays
// MaterialForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { MaterialViewModel } from "@/lib/mgr/material-view";

export type { MaterialViewModel };

export function MaterialView({ model, form }: { model: MaterialViewModel; form?: ReactNode }) {
  return form ?? (
    <>
      {E.edit("Material name", model.name)}
      {E.pick("Kind", model.kind, model.kindOptions)}
      {E.inline(
        E.edit("Base units", model.baseUnits, "number"),
        E.pick("Purchase unit", model.purchaseUnit, model.purchaseUnitOptions),
        E.pick("Unit", model.unit, model.unitOptions),
      )}
      {E.info("A 44 lb box is purchase unit each with 44 base units, not a “box” unit: the schema has one unit vocabulary and packaging is the factor.")}
      {E.row("Lot-tracked", "receipts name a lot · consumption picks one", E.sw(model.lotTracked, "Lot-tracked"), "ok")}
      {E.row("Active", "available to recipes and purchase orders", E.sw(model.active, "Material active"), "ok")}
      {E.btn("Save material")}
    </>
  );
}
