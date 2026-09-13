"use client";

import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { OrderQuantity } from "./new-order";
import type { ReturnCreditViewModel } from "@/lib/mgr/return-credit-view";

export type { ReturnCreditViewModel };

export function ReturnSourcesView({ groups, quantities = {}, onQuantity }: {
  groups: { key: string; name: string; sources: { id: string; label: string; shipped: number }[] }[];
  quantities?: Record<string, string>; onQuantity?: (id: string, value: string) => void;
}) {
  return <>
    {E.ttl("Original shipped source")}
    {groups.map(group => <div key={group.key} className="flex flex-col gap-2">
      {E.ttl(group.name)}
      {group.sources.map(source => <Field key={source.id}>
        <FieldLabel>{source.label} ({source.shipped} originally shipped)</FieldLabel>
        <Input aria-label={`${group.name} · ${source.label} return quantity`} type="number" min="0" step="0.01" max={source.shipped} placeholder="Quantity from this source"
          value={onQuantity ? quantities[source.id] ?? "" : undefined} defaultValue={onQuantity ? undefined : quantities[source.id] ?? ""}
          onChange={event => onQuantity?.(source.id, event.target.value)} />
      </Field>)}
    </div>)}
  </>;
}

export function ReturnCreditView({ model, sources, footer, tape, reason, quantities, onQuantity, onReason, onReturnTo, bins, binId = "", onBin, messages, submitting = false, disabled = false }: {
  model: ReturnCreditViewModel; sources?: ReactNode; footer?: ReactNode;
  tape?: [ReactNode, ReactNode?][]; reason?: number;
  quantities?: Record<string, string>; onQuantity?: (id: string, value: string) => void;
  onReason?: (index: number) => void; onReturnTo?: (id: string) => void;
  bins?: { id: string; name: string }[]; binId?: string; onBin?: (id: string) => void;
  messages?: ReactNode; submitting?: boolean; disabled?: boolean;
}) {
  const selectedReason = reason ?? model.reason;
  return <>
    {E.back(model.backTo, model.title, undefined, model.backHref)}
    {model.lines.length === 0 && E.info("No returnable beer lines")}
    {model.lines.map(line => <div key={line.key}>{E.row(line.name, line.detail,
      <OrderQuantity label={`${line.name} return quantity`} value={quantities?.[line.key] ?? line.qty} max={line.shipped} step="0.01" onChange={onQuantity && (value => onQuantity(line.key, value))} />)}</div>)}
    <ToggleGroup type="single" aria-label="Reason" variant="outline" size="sm" className="flex-wrap justify-start"
      value={onReason ? String(selectedReason) : undefined} defaultValue={onReason ? undefined : String(selectedReason)}
      onValueChange={value => { if (value !== "") onReason?.(Number(value)); }}>
      {model.reasons.map((label, index) => <ToggleGroupItem key={label} value={String(index)}>{label}</ToggleGroupItem>)}
    </ToggleGroup>
    <Field><FieldLabel>Return to</FieldLabel>
      <Select value={onReturnTo ? model.returnToId : undefined} defaultValue={onReturnTo ? undefined : model.returnToId} onValueChange={onReturnTo}>
        <SelectTrigger aria-label="Return to"><SelectValue placeholder="Select location" /></SelectTrigger>
        <SelectContent>{model.returnToOptions.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
    {bins !== undefined && <Field><FieldLabel>Return to bin</FieldLabel>
      <select aria-label="Return to bin" className="min-w-0 rounded border p-2" required value={onBin ? binId : undefined} defaultValue={onBin ? undefined : binId} onChange={event => onBin?.(event.target.value)}>
        <option value="">Choose bin</option>{bins.map(bin => <option key={bin.id} value={bin.id}>{bin.name}</option>)}
      </select>
    </Field>}
    {model.depositLabel && model.depositAmount ? <>{E.row("Deposit refund · unavailable", model.depositLabel, model.depositAmount)}{E.info("Deposit refunds are not included in this beer return.")}</> : null}
    {E.info(model.creditInfo)}
    {E.tape(tape ?? model.tape)}
    {E.note(model.note)}
    {sources}
    {messages}
    {E.sp()}
    {footer !== undefined ? footer : <Button type="submit" data-variant="irreversible" className="w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit md:self-end" disabled={submitting || disabled}>{submitting ? "Saving…" : "Return shipment"}</Button>}
  </>;
}
