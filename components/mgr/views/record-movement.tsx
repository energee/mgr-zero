// components/mgr/views/record-movement.tsx — shared Record movement sheet body.
// A wrong Quantity or Destination state is marked on its own field, with the
// message under it, once the user leaves the field (#1113, the #1121 timing).
// An empty SKU list says where SKUs are made, or who makes them (noSkus).
"use client";
import { useId, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RecordMovementViewModel } from "@/lib/mgr/record-movement-view";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import { noSkus } from "./new-transfer";

export type { RecordMovementViewModel };

export type RecordMovementControls = Partial<Record<
  "kind" | "sku" | "location" | "bin" | "channel" | "destState" | "direction" | "lot" | "qty" | "note",
  (value: string) => void
>>;

/** Field slots in useTouchedLines. This form has no lines, so each slot is one
 *  field, not a line number. */
const QTY = 0;
const DEST_STATE = 1;

function Pick({ label, value, options, onChange, disabled, forward, placeholder = `Select ${label.toLowerCase()}` }: { label: string; value: string; options: string[]; onChange?: (value: string) => void; disabled?: boolean; forward?: boolean; placeholder?: string }) {
  return E.pick(label, value, options, { onChange, disabled, forward, placeholder, displayValue: value || undefined });
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
  const id = useId();
  const touched = useTouchedLines(!controls.qty);
  const qtyError = touched.shown(QTY) ? model.errors?.qty : undefined;
  const destStateError = touched.shown(DEST_STATE) ? model.errors?.destState : undefined;
  let binPlaceholder = "Choose a location first";
  if (model.location) binPlaceholder = model.binOptions.length ? "Select bin" : "No bins at this location";
  return (
    <>
      <div className="md:hidden"><Pick label="Movement type" value={model.kind} options={model.kindOptions} onChange={controls.kind} /></div>
      <div className="hidden md:block"><ToggleGroup aria-label="Movement type" type="single" value={controls.kind ? model.kind : undefined} defaultValue={controls.kind ? undefined : model.kind} onValueChange={controls.kind} variant="outline" size="sm" className="flex-wrap justify-start">{model.kindOptions.map(option => <ToggleGroupItem key={option} value={option}>{option}</ToggleGroupItem>)}</ToggleGroup></div>
      {E.pick("SKU / package", model.skuId ?? model.sku, model.skuOptions, { id: `${id}-sku`, onChange: controls.sku, forward: true, placeholder: "Select SKU or package", displayValue: model.sku || undefined, empty: noSkus(model.skusHref) })}
      <Pick label="Location" value={model.location} options={model.locationOptions} onChange={controls.location} />
      <Pick label="Bin" value={model.bin} options={model.binOptions} onChange={controls.bin} disabled={model.binOptions.length === 0} placeholder={binPlaceholder} />
      {model.channelOptions.length ? <Pick label="Channel" value={model.channel} options={model.channelOptions} onChange={controls.channel} /> : null}
      {model.destStateInput ? E.edit("Destination state", model.destState, "text", undefined, { id: `${id}-state`, onChange: controls.destState, onBlur: () => touched.touch(DEST_STATE), error: destStateError, required: true, maxLength: 2, pattern: "[A-Za-z]{2}", placeholder: "PA" })
        : model.destStateOptions.length ? <Pick label="Destination state" value={model.destState} options={model.destStateOptions} onChange={controls.destState} /> : null}
      {model.directionOptions ? <Pick label="Direction" value={model.direction ?? ""} options={model.directionOptions} onChange={controls.direction} /> : null}
      {model.lotOptions ? <Pick label="Lot" value={model.lot ?? ""} options={model.lotOptions} onChange={controls.lot} /> : null}
      {E.edit("Quantity", model.qty, "number", undefined, { id: `${id}-qty`, onChange: controls.qty, onBlur: () => touched.touch(QTY), error: qtyError, required: Boolean(controls.qty), min: "0.01", step: "0.01" })}
      {model.note !== undefined ? E.edit("Note", model.note, "text", undefined, { onChange: controls.note }) : null}
      {model.preview ? E.info(model.preview) : null}
      {messages}
      {footer !== undefined ? footer : E.pin(<>{E.btn("Record movement", "irr")}</>)}
    </>
  );
}
