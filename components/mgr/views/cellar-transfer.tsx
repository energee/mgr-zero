"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Qty } from "@/components/mgr/qty";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { transferPreview, type CellarTransferViewModel, type TransferOccupancy } from "@/lib/mgr/cellar-transfer-view";

const identity = (o: TransferOccupancy) => [o.brand_name, o.batch_no == null ? null : `B-${String(o.batch_no).padStart(4, "0")}`].filter(Boolean).join(" · ");

export function CellarTransferFooter({ formId, submitting = false, disabled = false }: { formId?: string; submitting?: boolean; disabled?: boolean }) {
  return <Button form={formId} type="submit" data-variant="irreversible" className="bg-irreversible text-irreversible-foreground hover:bg-irreversible/90" disabled={submitting || disabled}>{submitting ? "Saving…" : "Record transfer"}</Button>;
}

export function CellarTransferView({ model, onChange, messages, footer, submitting = false }: {
  model: CellarTransferViewModel; onChange?: (patch: Partial<Pick<CellarTransferViewModel, "fromId" | "toId" | "volume" | "loss">>) => void;
  messages?: ReactNode; footer?: ReactNode; submitting?: boolean;
}) {
  const source = model.occupancies.find(o => o.occupancy_id === model.fromId);
  const target = model.vessels.find(v => v.id === model.toId);
  const occupied = model.occupancies.find(o => o.vessel_id === target?.id);
  const preview = transferPreview(source?.bbl, model.volume, model.loss);
  const held = transferPreview(source?.bbl, model.volume, "").remainder;
  const targetVolume = Number(((occupied?.bbl ?? 0) + preview.moving).toFixed(8));
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      <Field><FieldLabel>From</FieldLabel><select aria-label="From" required className="min-w-0 rounded border bg-background p-2" value={onChange ? model.fromId : undefined} defaultValue={onChange ? undefined : model.fromId} onChange={e => onChange?.({ fromId: e.target.value, loss: "" })}>
        <option value="">Source occupancy</option>{model.occupancies.map(o => <option key={o.occupancy_id} value={o.occupancy_id}>{o.vessel_name ?? "Unnamed vessel"} · {identity(o)} · {o.bbl} bbl</option>)}
      </select></Field>
      <Field><FieldLabel>To</FieldLabel><select aria-label="To" required className="min-w-0 rounded border bg-background p-2" value={onChange ? model.toId : undefined} defaultValue={onChange ? undefined : model.toId} onChange={e => onChange?.({ toId: e.target.value })}>
        <option value="">Destination vessel</option>{model.vessels.map(v => { const o = model.occupancies.find(o => o.vessel_id === v.id); return <option key={v.id} value={v.id} disabled={v.id === source?.vessel_id}>{v.name} · {o ? `${identity(o)} · ${o.bbl} / ${v.capacity_bbl} bbl` : "empty"}</option>; })}
      </select></Field>
      <Qty label="Barrels moving" value={model.volume} unit="bbl" onChange={onChange ? volume => onChange({ volume, loss: "" }) : undefined} />
      {source && target && preview.valid && E.info(`${occupied ? "Blend" : "Transfer"} preview: ${target.name} ${occupied?.bbl ?? 0} + ${preview.moving} = ${targetVolume} / ${target.capacity_bbl} bbl${occupied ? ` · keeps ${identity(occupied) || "its existing batch identity"}` : " · opens a new occupancy"}. ${source.vessel_name ?? "Source"} keeps ${preview.remainder} bbl; ${preview.loss} bbl recorded as loss.`)}
      {source && E.fld(`Remainder in ${source.vessel_name ?? "source"}`, preview.remainder === undefined || !Number.isFinite(preview.remainder) ? "—" : `${preview.remainder} bbl`)}
      <ToggleGroup type="single" variant="outline" size="sm" className="flex-wrap justify-start" value={onChange ? (preview.loss === 0 ? "hold" : preview.remainder === 0 ? "loss" : "") : undefined} defaultValue={onChange ? undefined : "hold"} onValueChange={value => { if (value) onChange?.({ loss: value === "loss" && held !== undefined && held >= 0 ? String(held) : "" }); }}>
        <ToggleGroupItem value="hold">Leave in {source?.vessel_name ?? "source"}</ToggleGroupItem><ToggleGroupItem value="loss" disabled={held === undefined || !Number.isFinite(held) || held < 0}>Record as loss</ToggleGroupItem>
      </ToggleGroup>
      <Field><FieldLabel>Loss (bbl) · optional</FieldLabel><Input aria-label="Loss (bbl) · optional" type="number" min="0" step="any" value={onChange ? model.loss : undefined} defaultValue={onChange ? undefined : model.loss} onChange={e => onChange?.({ loss: e.target.value })} /></Field>
    </fieldset>
    {messages}
    {footer !== undefined ? footer : E.pin(<CellarTransferFooter submitting={submitting} />)}
  </>;
}
