"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
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
      {E.edit("Name", model.name, "text", undefined, { onChange: onName, disabled: submitting, required: true })}
      {E.pick("Type", model.type, (model.typeOptions.map(type => ({ value: type, label: type }))), { onChange: onType, disabled: submitting })}
      {E.edit("Capacity (bbl)", model.capacity, "number", undefined, { onChange: onCapacity, disabled: submitting, required: true, min: "0", step: "any" })}
    </FieldGroup>
    {messages}
    {footer !== undefined ? footer : <Button type="submit" disabled={submitting || disabled}>{submitting ? "Saving…" : "Save vessel"}</Button>}
  </>;
}
