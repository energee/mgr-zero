"use client";
import { Fragment, useId, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { FieldGroup } from "@/components/ui/field";
import { vesselCapacityError, type VesselDetailViewModel } from "@/lib/mgr/vessel-detail-view";
import { ConfirmDeleteControl } from "./confirm-delete";

export type { VesselDetailViewModel };

/** Confirm, then delete one vessel (delete_vessel); one with batch history is retired instead. */
export function RemoveVesselControl({ vessel, ...rest }: { vessel: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> }) {
  return <ConfirmDeleteControl title="Delete vessel" {...rest}
    name={<>Delete <strong>{vessel}</strong>?</>}
    warning="A vessel holding beer cannot be deleted. A vessel that has held beer is retired instead: it leaves the cellar and its batch history stays." />;
}

/** `editable` is false for a brewer: the vessel facts read as text, with no Save or Delete (vessels are admin-managed).
 *  A model with no `readings` is New vessel: nothing has happened in it yet, so only the facts are drawn.
 *  `reason` (vesselReason) says what Save vessel still needs. */
export function VesselDetailView({ model, onName, onType, onCapacity, messages, submitting = false, reason, editable = true, remove, footer }: {
  model: VesselDetailViewModel; onName?: (value: string) => void; onType?: (value: string) => void; onCapacity?: (value: string) => void;
  messages?: ReactNode; submitting?: boolean; reason?: string | null; editable?: boolean; remove?: ReactNode; footer?: ReactNode;
}) {
  const capacityId = useId();
  // A drawn fixture (no onCapacity) shows its capacity error at once; a live one waits until the field is left.
  const [showCapacityError, setShowCapacityError] = useState(!onCapacity);
  return <>
    {E.back("Cellar", model.title, undefined, model.backHref, "Cellar map")}
    {model.retired && E.info("This vessel is retired. It is out of the cellar and takes no new beer; its batch history stays.")}
    {model.readings && <>
      {model.occupancy ? E.nav(model.occupancy.title, model.occupancy.detail, model.occupancy.warning ? "w" : "", undefined, model.occupancy.href) : E.blank("No open occupancy")}
      {E.fld("Current reading", model.readings.current)}
      {model.readingHref && E.btn("Reading", "p", model.readingHref)}
      {E.ttl("Reading history")}
      {model.readings.history.length ? model.readings.history.map(row => <Fragment key={row.key}>{E.row(row.title, row.detail, row.who)}</Fragment>) : E.blank("No readings yet")}
    </>}
    {E.ttl("Vessel facts")}
    {editable ? <>
      <FieldGroup>
        {E.edit("Name", model.name, "text", undefined, { onChange: onName, disabled: submitting, required: true })}
        {E.pick("Type", model.type, (model.typeOptions.map(type => ({ value: type, label: type }))), { onChange: onType, disabled: submitting })}
        {E.edit("Capacity (bbl)", model.capacity, "number", undefined, {
          onChange: onCapacity, onBlur: () => setShowCapacityError(true), disabled: submitting, required: true, min: "0", step: "any",
          id: capacityId, error: showCapacityError ? vesselCapacityError(model.capacity) : undefined,
        })}
      </FieldGroup>
      {messages}
      {remove}
      {footer !== undefined ? footer : E.submit("Save vessel", { submitting, reason })}
    </> : <>
      {E.fld("Name", model.name)}
      {E.fld("Type", model.type)}
      {E.fld("Capacity (bbl)", model.capacity)}
    </>}
  </>;
}
