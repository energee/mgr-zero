// components/mgr/views/record-movement.tsx — shared Record movement sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { DirectionIcon } from "@/components/mgr/icon";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RecordMovementViewModel } from "@/lib/mgr/record-movement-view";

export type { RecordMovementViewModel };

export type RecordMovementControls = Partial<Record<
  "kind" | "sku" | "location" | "bin" | "channel" | "destState" | "direction" | "lot" | "qty" | "note",
  (value: string) => void
>>;

function Pick({ label, value, options, onChange, disabled, forward }: { label: string; value: string; options: string[]; onChange?: (value: string) => void; disabled?: boolean; forward?: boolean }) {
  return <Field>
    <FieldLabel>{label}</FieldLabel>
    <Select value={onChange ? value : undefined} defaultValue={onChange ? undefined : value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className={forward ? "[&_svg:last-child]:hidden" : undefined}><SelectValue placeholder={`Select ${label.toLowerCase()}`}>{value || undefined}</SelectValue>{forward ? <DirectionIcon label="Open" /> : null}</SelectTrigger>
      <SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  </Field>;
}

export function RecordMovementView({
  model,
  controls = {},
  messages,
  footer,
}: {
  model: RecordMovementViewModel;
  controls?: RecordMovementControls;
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="md:hidden"><Pick label="Kind" value={model.kind} options={model.kindOptions} onChange={controls.kind} /></div>
      <div className="hidden md:block"><ToggleGroup type="single" value={controls.kind ? model.kind : undefined} defaultValue={controls.kind ? undefined : model.kind} onValueChange={controls.kind} variant="outline" size="sm" className="flex-wrap justify-start">{model.kindOptions.map((option) => <ToggleGroupItem key={option} value={option}>{option}</ToggleGroupItem>)}</ToggleGroup></div>
      <Pick label="SKU / package" value={model.sku} options={model.skuOptions} onChange={controls.sku} forward />
      <Pick label="Location" value={model.location} options={model.locationOptions} onChange={controls.location} />
      <Pick label="Bin" value={model.bin} options={model.binOptions} onChange={controls.bin} disabled={model.binOptions.length === 0} />
      {model.channelOptions.length ? <Pick label="Channel" value={model.channel} options={model.channelOptions} onChange={controls.channel} /> : null}
      {model.destStateInput ? <Field><FieldLabel>Destination state</FieldLabel><Input aria-label="Destination state" value={model.destState} onChange={controls.destState ? event => controls.destState!(event.target.value) : undefined} required pattern="[A-Za-z]{2}" maxLength={2} placeholder="PA" /></Field>
        : model.destStateOptions.length ? <Pick label="Destination state" value={model.destState} options={model.destStateOptions} onChange={controls.destState} /> : null}
      {model.directionOptions ? <Pick label="Direction" value={model.direction ?? ""} options={model.directionOptions} onChange={controls.direction} /> : null}
      {model.lotOptions ? <Pick label="Lot" value={model.lot ?? ""} options={model.lotOptions} onChange={controls.lot} /> : null}
      <Field><FieldLabel>Quantity</FieldLabel><Input aria-label="Quantity" type="number" min="0.01" step="0.01" required={Boolean(controls.qty)} value={controls.qty ? model.qty : undefined} defaultValue={controls.qty ? undefined : model.qty} onChange={controls.qty ? event => controls.qty!(event.target.value) : undefined} /></Field>
      {model.note !== undefined ? <Field><FieldLabel>Note</FieldLabel><Input aria-label="Note" value={controls.note ? model.note : undefined} defaultValue={controls.note ? undefined : model.note} onChange={controls.note ? event => controls.note!(event.target.value) : undefined} /></Field> : null}
      {E.info(model.preview)}
      {messages}
      {footer !== undefined ? footer : E.pin(<>{E.btn("Record movement", "irr")}</>)}
    </>
  );
}
