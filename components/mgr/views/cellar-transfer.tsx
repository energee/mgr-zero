// components/mgr/views/cellar-transfer.tsx — Cellar transfer sheet: From
// (an occupancy), To (a vessel), the barrels moving, the blend or transfer
// preview, and what happens to the beer left in the source. Inventory passes a
// fixture with no onChange; live wraps it in cellar-transfer-form.tsx.
"use client";
import { useId, type ReactNode } from "react";
import { E, type PickEmpty } from "@/components/mgr/e";
import { Qty } from "@/components/mgr/qty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { occupancyIdentity as identity, transferDestinations, transferPreview, transferReason, type CellarTransferViewModel } from "@/lib/mgr/cellar-transfer-view";

/** The To list's empty note when the source is the only vessel (#1481); see addVesselHref. */
const noOtherVessel = (href: string | null | undefined): PickEmpty => href === null
  ? { text: "No other vessel. Ask Admin to add one." }
  : { text: "No other vessel.", label: "Add a vessel", href, to: "New vessel" };

export function CellarTransferFooter(props: { formId?: string; submitting?: boolean; disabled?: boolean; reason?: string | null }) {
  return <IrreversibleSubmit label="Record transfer" {...props} />;
}

export function CellarTransferView({ model, onChange, messages, footer, submitting = false }: {
  model: CellarTransferViewModel; onChange?: (patch: Partial<Pick<CellarTransferViewModel, "fromId" | "toId" | "volume" | "loss">>) => void;
  messages?: ReactNode; footer?: ReactNode; submitting?: boolean;
}) {
  const source = model.occupancies.find(o => o.occupancy_id === model.fromId);
  const destinations = transferDestinations(model);
  const target = destinations.find(v => v.id === model.toId);
  const occupied = model.occupancies.find(o => o.vessel_id === target?.id);
  const preview = transferPreview(source?.bbl, model.volume, model.loss);
  const held = transferPreview(source?.bbl, model.volume, "").remainder;
  const fromHelp = useId();
  const toHelp = useId();
  const restId = useId();
  const targetVolume = Number(((occupied?.bbl ?? 0) + preview.moving).toFixed(8));
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {E.pick("From", model.fromId, [{ value: "", label: "Source occupancy" }, ...(model.occupancies.map(o => ({ value: o.occupancy_id, label: (o.vessel_name ?? "Unnamed vessel") + " · " + (identity(o)) + " · " + o.bbl + " bbl" })))], { onChange: onChange ? (nextValue: string) => onChange?.({ fromId: nextValue, loss: "" }) : undefined, required: true, "aria-describedby": fromHelp, description: <FieldDescription id={fromHelp}>The tank the beer leaves.</FieldDescription> })}
      {E.pick("To", model.toId, [{ value: "", label: "Destination vessel" }, ...destinations.map(v => { const o = model.occupancies.find(o => o.vessel_id === v.id); return { value: v.id, label: v.name + " · " + (o ? `${identity(o)} · ${o.bbl} / ${v.capacity_bbl} bbl` : "empty") }; })], { onChange: onChange ? (nextValue: string) => onChange?.({ toId: nextValue }) : undefined, required: true, "aria-describedby": toHelp, description: <FieldDescription id={toHelp}>The tank the beer goes into. One that already holds beer is a blend.</FieldDescription>, empty: noOtherVessel(model.addVesselHref) })}
      <Qty label="Barrels moving" value={model.volume} unit="bbl" onChange={onChange ? volume => onChange({ volume, loss: "" }) : undefined} />
      {source && target && preview.valid && E.info(`${occupied ? "Blend" : "Transfer"} preview: ${target.name} ${occupied?.bbl ?? 0} + ${preview.moving} = ${targetVolume} / ${target.capacity_bbl} bbl${occupied ? ` · keeps ${identity(occupied) || "its existing batch identity"}` : " · opens a new occupancy"}. ${source.vessel_name ?? "Source"} keeps ${preview.remainder} bbl; ${preview.loss} bbl recorded as loss.`)}
      {source && E.fld(`Remainder in ${source.vessel_name ?? "source"}`, preview.remainder === undefined || !Number.isFinite(preview.remainder) ? "—" : `${preview.remainder} bbl`)}
      {/* The visible heading names the choice about the beer left behind; the options carry the tank name (#1115). */}
      <Field>
        <FieldLabel id={restId}>What happens to the remainder</FieldLabel>
        <ToggleGroup type="single" variant="outline" size="sm" className="flex-wrap justify-start" aria-labelledby={restId} value={onChange ? (preview.loss === 0 ? "hold" : preview.remainder === 0 ? "loss" : "") : undefined} defaultValue={onChange ? undefined : "hold"} onValueChange={value => { if (value) onChange?.({ loss: value === "loss" && held !== undefined && held >= 0 ? String(held) : "" }); }}>
          <ToggleGroupItem value="hold">Leave in {source?.vessel_name ?? "source"}</ToggleGroupItem><ToggleGroupItem value="loss" disabled={held === undefined || !Number.isFinite(held) || held < 0}>Record as loss</ToggleGroupItem>
        </ToggleGroup>
      </Field>
      {E.edit("Loss (bbl) · optional", model.loss, "number", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ loss: nextValue }) : undefined, min: "0", step: "any" })}
    </fieldset>
    {messages}
    {footer !== undefined ? footer : E.pin(<CellarTransferFooter submitting={submitting} reason={transferReason(model)} />)}
  </>;
}
