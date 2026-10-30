"use client";
import { Fragment, useId, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { FieldGroup } from "@/components/ui/field";
import { vesselCapacityError, type VesselDetailViewModel } from "@/lib/mgr/vessel-detail-view";
import { ConfirmDeleteControl } from "./confirm-delete";
import { VESSEL_CAPACITY_MIN, VESSEL_CAPACITY_MAX } from "@/lib/vessel-capacity";

/** Confirm, then delete one vessel (delete_vessel); one with batch history is retired instead. */
export function RemoveVesselControl({ vessel, ...rest }: { vessel: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> }) {
  return <ConfirmDeleteControl title="Delete vessel" {...rest}
    name={<>Delete <strong>{vessel}</strong>?</>}
    warning="A vessel holding beer cannot be deleted. A vessel that has held beer is retired instead: it leaves the cellar and its batch history stays." />;
}

/** `editable` is false for a brewer: the vessel facts read as text, with no Save or Delete (vessels are admin-managed).
 *  A model with no `readings` is New vessel: nothing has happened in it yet, so only the facts are drawn.
 *  `reason` (vesselReason) says what Save vessel still needs. `actions` (Transfer, Addition, Complete batch for
 *  the open occupancy) sit beside Reading, so they open on this tank (#1508). */
export function VesselDetailView({ model, onName, onType, onCapacity, messages, submitting = false, reason, editable = true, remove, footer, actions }: {
  model: VesselDetailViewModel; onName?: (value: string) => void; onType?: (value: string) => void; onCapacity?: (value: string) => void;
  messages?: ReactNode; submitting?: boolean; reason?: string | null; editable?: boolean; remove?: ReactNode; footer?: ReactNode; actions?: ReactNode;
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
      {(model.readingHref || actions) && <div className="flex flex-wrap gap-2">{model.readingHref && E.btn("Reading", "p", model.readingHref)}{actions}</div>}
      {E.ttl("Reading history")}
      {model.readings.history.length ? model.readings.history.map(row => <Fragment key={row.key}>{E.row(row.title, row.detail, row.who)}</Fragment>) : E.blank("No readings yet")}
    </>}
    {E.group("Vessel facts")}
    {editable ? <>
      <FieldGroup>
        {E.edit("Name", model.name, "text", undefined, { onChange: onName, disabled: submitting, required: true })}
        {E.pick("Type", model.type, (model.typeOptions.map(type => ({ value: type, label: type }))), { onChange: onType, disabled: submitting })}
        {E.edit("Capacity (bbl)", model.capacity, "number", undefined, {
          onChange: onCapacity, onBlur: () => setShowCapacityError(true), disabled: submitting, required: true, min: String(VESSEL_CAPACITY_MIN), max: String(VESSEL_CAPACITY_MAX), step: String(VESSEL_CAPACITY_MIN),
          id: capacityId, error: showCapacityError ? vesselCapacityError(model.capacity) : undefined,
        })}
      </FieldGroup>
      {messages}
      {footer !== undefined ? footer : E.submit("Save vessel", { submitting, reason })}
      {/* Apart from Save, under its own rule, as on Contract and License (#1481). */}
      {remove && <section aria-label="Delete vessel" className="mt-2 flex flex-col gap-4 border-t pt-5 @min-[48rem]:flex-row @min-[48rem]:items-center @min-[48rem]:justify-between">
        <div>
          <h2 className="text-sm font-medium">Delete vessel</h2>
          <p className="mt-1 text-sm text-muted-foreground">A vessel that has held beer is retired instead, and its batch history stays.</p>
        </div>
        <div className="shrink-0 self-start">{remove}</div>
      </section>}
    </> : <>
      {E.fld("Name", model.name)}
      {E.fld("Type", model.type)}
      {E.fld("Capacity (bbl)", model.capacity)}
    </>}
  </>;
}
