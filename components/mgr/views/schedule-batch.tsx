// components/mgr/views/schedule-batch.tsx — shared Schedule batch sheet body.
import type { ReactNode } from "react";
import { DatePicker } from "@/components/mgr/date-picker";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ScheduleBatchViewModel } from "@/lib/mgr/schedule-batch-view";

export type { ScheduleBatchViewModel };

type Controls = Partial<Record<"recipeId" | "brandId" | "plannedBbl" | "date" | "note", (value: string) => void>>;

function OptionalPick({ label, value, options, onChange }: {
  label: string; value?: string; options: { id: string; label: string }[]; onChange?: (value: string) => void;
}) {
  const selected = value || NONE;
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={onChange ? selected : undefined} defaultValue={onChange ? undefined : selected} onValueChange={onChange}>
        <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not decided</SelectItem>
          {options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function ScheduleBatchView({ model, controls = {}, messages, footer }: {
  model: ScheduleBatchViewModel; controls?: Controls; messages?: ReactNode; footer?: ReactNode;
}) {
  const barrels = Number(model.plannedBbl) || 0;
  return (
    <>
      {E.back("Batches", model.title, undefined, model.backHref)}
      <OptionalPick label="Recipe · optional" value={model.recipeId} options={model.recipeOptions} onChange={controls.recipeId} />
      <OptionalPick label="Brand · optional" value={model.brandId} options={model.brandOptions} onChange={controls.brandId} />
      <Field>
        <FieldLabel>Planned barrels</FieldLabel>
        <ButtonGroup>
          <Button type="button" variant="outline" size="icon" aria-label="Decrease" onClick={() => controls.plannedBbl?.(String(Math.max(0, barrels - 1)))}>−</Button>
          <Input aria-label="Planned barrels" type="number" inputMode="decimal" min={0} step="any" value={controls.plannedBbl ? model.plannedBbl : undefined} defaultValue={controls.plannedBbl ? undefined : model.plannedBbl} onChange={(event) => controls.plannedBbl?.(event.target.value)} required={Boolean(controls.plannedBbl)} />
          <Button type="button" variant="outline" size="icon" aria-label="Increase" onClick={() => controls.plannedBbl?.(String(barrels + 1))}>+</Button>
        </ButtonGroup>
      </Field>
      {controls.date
        ? <DatePicker label="Date" value={model.date} onChange={controls.date} />
        : <DatePicker label="Date" defaultValue={model.date} />}
      <Field>
        <FieldLabel>Note · optional</FieldLabel>
        <Input aria-label="Note · optional" value={controls.note ? model.note : undefined} defaultValue={controls.note ? undefined : model.note} onChange={(event) => controls.note?.(event.target.value)} />
      </Field>
      {E.sp()}
      {messages}
      {footer !== undefined ? footer : E.btn("Save schedule")}
    </>
  );
}
