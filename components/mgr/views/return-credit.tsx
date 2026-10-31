"use client";

import { E } from "@/components/mgr/e";
import { IrreversibleSubmit } from "@/components/mgr/irreversible-submit";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OrderQuantity } from "./new-order";
import { returnQuantityError, type ReturnCreditViewModel } from "@/lib/mgr/return-credit-view";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import type { ReactNode } from "react";
import { Fragment } from "react";

export function ReturnSourcesView({ groups, quantities = {}, onQuantity }: {
  groups: { key: string; name: string; sources: { id: string; label: string; shipped: number }[] }[];
  quantities?: Record<string, string>; onQuantity?: (id: string, value: string) => void;
}) {
  return <>
    {E.ttl("Original shipped source")}
    {groups.map(group => <div key={group.key} className="flex flex-col gap-2">
      {E.ttl(group.name)}
      {group.sources.map(source => <Fragment key={source.id}>{E.edit(source.label + " (" + source.shipped + " originally shipped)", quantities[source.id] ?? "", "number", undefined, { onChange: onQuantity ? (nextValue: string) => onQuantity?.(source.id, nextValue) : undefined, min: "0", max: source.shipped, step: "0.01", placeholder: "Quantity from this source", "aria-label": `${group.name} · ${source.label} return quantity` })}</Fragment>)}
    </div>)}
  </>;
}

/** `reason` is the selected chip; `blockedReason` (returnCreditReason) says why
 *  Return shipment is withheld. A bad quantity is marked under its field once
 *  the field is left, or at once in the inventory. */
export function ReturnCreditView({ model, sources, footer, tape, reason, quantities, onQuantity, onReason, onReturnTo, bins, binId = "", onBin, returnEmptyKegs = false, onReturnEmptyKegs, messages, submitting = false, blockedReason }: {
  model: ReturnCreditViewModel; sources?: ReactNode; footer?: ReactNode;
  tape?: [ReactNode, ReactNode?][]; reason?: number;
  quantities?: Record<string, string>; onQuantity?: (id: string, value: string) => void;
  onReason?: (index: number) => void; onReturnTo?: (id: string) => void;
  bins?: { id: string; name: string }[]; binId?: string; onBin?: (id: string) => void;
  returnEmptyKegs?: boolean; onReturnEmptyKegs?: (value: boolean) => void;
  messages?: ReactNode; submitting?: boolean; blockedReason?: string | null;
}) {
  const selectedReason = reason ?? model.reason;
  const touched = useTouchedLines(!onQuantity);
  return <>
    {E.back(model.backTo, model.title, undefined, model.backHref)}
    {model.lines.length === 0 && E.info("No returnable lines")}
    {model.lines.map((line, index) => {
      const value = quantities?.[line.key] ?? String(line.qty);
      return <div key={line.key}>{E.row(line.name, line.detail,
        <OrderQuantity label={`${line.name} return quantity`} value={value} max={line.maxReturning} step={line.step} id={`return-qty-${line.key}`}
          error={touched.shown(index) ? returnQuantityError(value, line) : undefined} onBlur={() => touched.touch(index)}
          onChange={onQuantity && (next => onQuantity(line.key, next))} />)}</div>;
    })}
    {!model.returningBeer && model.lines.some(line => line.step === "1") && E.row("Check in empty kegs with this refund", "Leave off if the empty kegs were already recorded.", E.sw(returnEmptyKegs, "Check in empty kegs with this refund", onReturnEmptyKegs))}
    {model.returningBeer && <>
      <ToggleGroup type="single" aria-label="Reason" variant="outline" size="sm" className="flex-wrap justify-start"
        value={onReason ? String(selectedReason) : undefined} defaultValue={onReason ? undefined : String(selectedReason)}
        onValueChange={value => { if (value !== "") onReason?.(Number(value)); }}>
        {model.reasons.map((label, index) => <ToggleGroupItem key={label} value={String(index)}>{label}</ToggleGroupItem>)}
      </ToggleGroup>
    </>}
    {(model.returningBeer || returnEmptyKegs) && <>
      {E.pick("Return to", model.returnToId, model.returnToOptions.map(option => ({ value: option.id, label: option.label })), { onChange: onReturnTo, placeholder: "Select location" })}
      {bins !== undefined && E.pick("Return to bin", binId, [{ value: "", label: "Choose bin" }, ...(bins.map(bin => ({ value: bin.id, label: bin.name })))], { onChange: onBin, required: true })}
    </>}
    {E.info(model.creditInfo)}
    {E.tape(tape ?? model.tape)}
    {E.note(model.note)}
    {sources}
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : <IrreversibleSubmit label="Return shipment" className="w-full md:w-fit md:self-end" submitting={submitting} reason={blockedReason} />}
  </>;
}
