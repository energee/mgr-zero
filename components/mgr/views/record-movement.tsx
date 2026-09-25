// components/mgr/views/record-movement.tsx — shared Record movement sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RecordMovementViewModel } from "@/lib/mgr/record-movement-view";

export type { RecordMovementViewModel };

export type RecordMovementControls = Partial<Record<
  "kind" | "sku" | "location" | "bin" | "channel" | "destState" | "direction" | "lot" | "qty" | "note",
  (value: string) => void
>>;

function Pick({ label, value, options, onChange, disabled, forward }: { label: string; value: string; options: string[]; onChange?: (value: string) => void; disabled?: boolean; forward?: boolean }) {
  return E.pick(label, value, options, { onChange, disabled, forward, placeholder: `Select ${label.toLowerCase()}`, displayValue: value || undefined });
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
      <div className="hidden md:block"><ToggleGroup type="single" value={controls.kind ? model.kind : undefined} defaultValue={controls.kind ? undefined : model.kind} onValueChange={controls.kind} variant="outline" size="sm" className="flex-wrap justify-start">{model.kindOptions.map(option => <ToggleGroupItem key={option} value={option}>{option}</ToggleGroupItem>)}</ToggleGroup></div>
      {E.pick("SKU / package", model.skuId ?? model.sku, model.skuOptions, { onChange: controls.sku, forward: true, placeholder: "Select sku / package", displayValue: model.sku || undefined })}
      <Pick label="Location" value={model.location} options={model.locationOptions} onChange={controls.location} />
      <Pick label="Bin" value={model.bin} options={model.binOptions} onChange={controls.bin} disabled={model.binOptions.length === 0} />
      {model.channelOptions.length ? <Pick label="Channel" value={model.channel} options={model.channelOptions} onChange={controls.channel} /> : null}
      {model.destStateInput ? E.edit("Destination state", model.destState, "text", undefined, { onChange: controls.destState ? (nextValue: string) => controls.destState!(nextValue) : undefined, required: true, maxLength: 2, pattern: "[A-Za-z]{2}", placeholder: "PA" })
        : model.destStateOptions.length ? <Pick label="Destination state" value={model.destState} options={model.destStateOptions} onChange={controls.destState} /> : null}
      {model.directionOptions ? <Pick label="Direction" value={model.direction ?? ""} options={model.directionOptions} onChange={controls.direction} /> : null}
      {model.lotOptions ? <Pick label="Lot" value={model.lot ?? ""} options={model.lotOptions} onChange={controls.lot} /> : null}
      {E.edit("Quantity", model.qty, "number", undefined, { onChange: controls.qty ? controls.qty ? (nextValue: string) => controls.qty!(nextValue) : undefined : undefined, required: Boolean(controls.qty), min: "0.01", step: "0.01" })}
      {model.note !== undefined ? E.edit("Note", model.note, "text", undefined, { onChange: controls.note ? controls.note ? (nextValue: string) => controls.note!(nextValue) : undefined : undefined }) : null}
      {E.info(model.preview)}
      {messages}
      {footer !== undefined ? footer : E.pin(<>{E.btn("Record movement", "irr")}</>)}
    </>
  );
}
