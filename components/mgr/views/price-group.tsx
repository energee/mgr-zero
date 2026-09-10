// components/mgr/views/price-group.tsx — one price-group row. Inventory
// draws name / position / ceiling edits; live keeps GroupForm as the wrapper.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { PriceGroupViewModel } from "@/lib/mgr/price-group-view";

export type { PriceGroupViewModel };

type Controls = Partial<Record<"name" | "position" | "costCeiling", (value: string) => void>>;

function EditField({ label, value, type = "text", onChange }: {
  label: string; value: string; type?: "text" | "number"; onChange?: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input aria-label={label} type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "any" : undefined}
        value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} onChange={(event) => onChange?.(event.target.value)} />
    </Field>
  );
}

export function PriceGroupView({ model, controls = {}, back, messages, footer }: {
  model: PriceGroupViewModel; controls?: Controls; back?: ReactNode; messages?: ReactNode; footer?: ReactNode;
}) {
  return (
    <>
      {back !== undefined ? back : E.back("Price groups", model.name, undefined, model.backHref)}
      <EditField label="Group name" value={model.name} onChange={controls.name} />
      <EditField label="Position" value={model.position} type="number" onChange={controls.position} />
      <EditField label="Cost ceiling" value={controls.costCeiling ? model.costCeilingInput : model.costCeiling} type="number" onChange={controls.costCeiling} />
      {E.info("Groups sort by position, and the lower bound of a ceiling is the previous group’s. A cost inside this band suggests the group; nobody is moved automatically. Leave it empty and it reads none.")}
      {model.previousCeilingLabel && model.previousCeiling
        ? E.fld(model.previousCeilingLabel, model.previousCeiling)
        : null}
      {E.fld("Prices", model.prices)}
      {messages}
      {footer !== undefined ? footer : E.row("Remove price group", model.removeDetail, E.act("Remove", "destructive"), "w")}
    </>
  );
}
