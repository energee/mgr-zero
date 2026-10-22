"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import type { VesselDetailViewModel } from "@/lib/mgr/vessel-detail-view";
import { ConfirmDeleteControl } from "./confirm-delete";

export type { VesselDetailViewModel };

/** Confirm, then delete one vessel (delete_vessel); one with batch history is retired instead. */
export function RemoveVesselControl({ vessel, ...rest }: { vessel: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> }) {
  return <ConfirmDeleteControl title="Delete vessel" {...rest}
    name={<>Delete <strong>{vessel}</strong>?</>}
    warning="A vessel holding beer cannot be deleted. A vessel that has held beer is retired instead: it leaves the cellar and its batch history stays." />;
}

/** `editable` is false for a brewer: the vessel facts read as text, with no Save or Delete (vessels are admin-managed). */
export function VesselDetailView({ model, onName, onType, onCapacity, messages, submitting = false, disabled = false, editable = true, remove, footer }: {
  model: VesselDetailViewModel; onName?: (value: string) => void; onType?: (value: string) => void; onCapacity?: (value: string) => void;
  messages?: ReactNode; submitting?: boolean; disabled?: boolean; editable?: boolean; remove?: ReactNode; footer?: ReactNode;
}) {
  return <>
    {E.back("Cellar map", model.title, undefined, model.backHref)}
    {model.occupancy ? E.nav(model.occupancy.title, model.occupancy.detail, model.occupancy.warning ? "w" : "", undefined, model.occupancy.href) : E.blank("No open occupancy")}
    {E.fld("Current reading", model.currentReading)}
    {model.readingHref && E.btn("Reading", "p", model.readingHref)}
    {E.ttl("Reading history")}
    {model.history.length ? model.history.map(row => <Fragment key={row.key}>{E.row(row.title, row.detail, row.who)}</Fragment>) : E.blank("No readings yet")}
    {E.ttl("Vessel facts")}
    {editable ? <>
      <FieldGroup>
        {E.edit("Name", model.name, "text", undefined, { onChange: onName, disabled: submitting, required: true })}
        {E.pick("Type", model.type, (model.typeOptions.map(type => ({ value: type, label: type }))), { onChange: onType, disabled: submitting })}
        {E.edit("Capacity (bbl)", model.capacity, "number", undefined, { onChange: onCapacity, disabled: submitting, required: true, min: "0", step: "any" })}
      </FieldGroup>
      {messages}
      {remove}
      {footer !== undefined ? footer : <Button type="submit" disabled={submitting || disabled}>{submitting ? "Saving…" : "Save vessel"}</Button>}
    </> : <>
      {E.fld("Name", model.name)}
      {E.fld("Type", model.type)}
      {E.fld("Capacity (bbl)", model.capacity)}
    </>}
  </>;
}
