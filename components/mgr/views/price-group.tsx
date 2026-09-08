// components/mgr/views/price-group.tsx — one price-group row. Inventory
// draws name / position / ceiling edits; live keeps GroupForm as the wrapper.
import { E } from "@/components/mgr/e";
import type { PriceGroupViewModel } from "@/lib/mgr/price-group-view";

export type { PriceGroupViewModel };

export function PriceGroupView({ model }: { model: PriceGroupViewModel }) {
  return (
    <>
      {E.back("Price groups", model.name, undefined, model.backHref)}
      {E.edit("Group name", model.name)}
      {E.edit("Position", model.position, "number")}
      {E.edit("Cost ceiling", model.costCeiling)}
      {E.info("Groups sort by position, and the lower bound of a ceiling is the previous group’s. A cost inside this band suggests the group; nobody is moved automatically. Leave it empty and it reads none.")}
      {model.previousCeilingLabel && model.previousCeiling
        ? E.fld(model.previousCeilingLabel, model.previousCeiling)
        : null}
      {E.fld("Prices", model.prices)}
      {E.row("Remove price group", model.removeDetail, E.act("Remove", "destructive"), "w")}
    </>
  );
}
