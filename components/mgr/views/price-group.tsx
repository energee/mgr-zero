// components/mgr/views/price-group.tsx — one price-group row. Inventory
// draws name / position / ceiling edits; live keeps GroupForm as the wrapper.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PriceGroupViewModel } from "@/lib/mgr/price-group-view";

export type { PriceGroupViewModel };

type Controls = Partial<Record<"name" | "position" | "costCeiling", (value: string) => void>>;

export function PriceGroupView({ model, controls = {}, back, messages, footer }: {
  model: PriceGroupViewModel; controls?: Controls; back?: ReactNode; messages?: ReactNode; footer?: ReactNode;
}) {
  return (
    <>
      {back !== undefined ? back : E.back("Price groups", model.name, undefined, model.backHref)}
      {E.edit("Group name", model.name, "text", undefined, controls.name && { onChange: controls.name })}
      {E.edit("Position", model.position, "number", undefined, { onChange: controls.position, min: 0 })}
      {E.edit("Cost ceiling ($/bbl)", controls.costCeiling ? model.costCeilingInput : model.costCeiling, "number", undefined, { onChange: controls.costCeiling, min: 0 })}
      {E.info("Ceilings are dollars per barrel of recipe cost. Groups sort by position, and the lower bound of a ceiling is the previous group’s. A brand whose recipe cost lands inside this band gets this group suggested on Brand; nobody is moved automatically. Leave it empty and it reads none.")}
      {model.previousCeilingLabel && model.previousCeiling
        ? E.fld(model.previousCeilingLabel, model.previousCeiling)
        : null}
      {E.fld("Prices", model.prices)}
      {messages}
      {footer !== undefined ? footer : E.row("Remove price group", model.removeDetail, E.act("Remove", "destructive"), "w")}
    </>
  );
}
