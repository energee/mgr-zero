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
      {E.edit("Position", model.position, "number", undefined, { onChange: controls.position, min: 1, step: 1, required: true })}
      {E.edit("Cost ceiling ($/bbl)", controls.costCeiling ? model.costCeilingInput : model.costCeiling, "number", undefined, { onChange: controls.costCeiling, min: 0 })}
      {E.info("Dollars per barrel of recipe cost: a brand whose cost lands between the previous group’s ceiling and this one gets this group suggested on Brand, never moved.")}
      {model.previousCeilingLabel && model.previousCeiling
        ? E.fld(model.previousCeilingLabel, model.previousCeiling)
        : null}
      {model.prices !== undefined ? E.fld("Prices", model.prices) : null}
      {messages}
      {footer !== undefined ? footer : E.row("Remove price group", model.removeDetail ?? "", E.act("Remove", "destructive"), "w")}
    </>
  );
}
