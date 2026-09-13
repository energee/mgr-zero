"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { VesselDetailViewModel } from "@/lib/mgr/vessel-detail-view";

export type { VesselDetailViewModel };

export function VesselDetailView({ model, onName, onType, onCapacity, messages, submitting = false, disabled = false, footer }: {
  model: VesselDetailViewModel; onName?: (value: string) => void; onType?: (value: string) => void; onCapacity?: (value: string) => void;
  messages?: ReactNode; submitting?: boolean; disabled?: boolean; footer?: ReactNode;
}) {
  return <>
    {E.back("Cellar map", model.title, undefined, model.backHref)}
    {model.occupancy ? E.row(model.occupancy.title, model.occupancy.detail, E.act(model.occupancy.verb, "info", model.occupancy.href), model.occupancy.warning ? "w" : "") : E.blank("No open occupancy")}
    {E.fld("Current reading", model.currentReading)}
    {model.readingHref && E.btn("Reading", "p", model.readingHref)}
    {E.ttl("Reading history")}
    {model.history.length ? model.history.map(row => <Fragment key={row.key}>{E.row(row.title, row.detail, row.who)}</Fragment>) : E.blank("No readings yet")}
    {E.ttl("Vessel facts")}
    <FieldGroup>
      <Field data-disabled={submitting}><FieldLabel>Name</FieldLabel><Input aria-label="Name" required disabled={submitting} value={onName ? model.name : undefined} defaultValue={onName ? undefined : model.name} onChange={event => onName?.(event.target.value)} /></Field>
      <Field data-disabled={submitting}><FieldLabel>Type</FieldLabel><select aria-label="Type" className="min-h-9 rounded border bg-background p-2" disabled={submitting} value={onType ? model.type : undefined} defaultValue={onType ? undefined : model.type} onChange={event => onType?.(event.target.value)}>
        {model.typeOptions.map(type => <option key={type} value={type}>{type}</option>)}
      </select></Field>
      <Field data-disabled={submitting}><FieldLabel>Capacity (bbl)</FieldLabel><Input aria-label="Capacity (bbl)" type="number" min="0" step="any" required disabled={submitting} value={onCapacity ? model.capacity : undefined} defaultValue={onCapacity ? undefined : model.capacity} onChange={event => onCapacity?.(event.target.value)} /></Field>
    </FieldGroup>
    {messages}
    {footer !== undefined ? footer : <Button type="submit" disabled={submitting || disabled}>{submitting ? "Saving…" : "Save vessel"}</Button>}
  </>;
}
