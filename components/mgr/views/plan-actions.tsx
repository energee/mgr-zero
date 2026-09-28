"use client";
import { useState } from "react";
import { E } from "@/components/mgr/e";
import { CommandFormMessage } from "@/components/mgr/command-form";

/** The one notice a cancelled batch or packaging plan shows in place of its actions. */
export function PlanCancelled() {
  return E.info("Cancelled. This plan remains in history and no longer creates demand.");
}

/** Date changes and cancellation share the same controls for batch and packaging plans. */
export function PlanActions({ plannedOn, busy = false, error, onReschedule, onCancel }: {
  plannedOn: string; busy?: boolean; error?: string | null;
  onReschedule?: (date: string) => void; onCancel?: () => void;
}) {
  const [date, setDate] = useState(plannedOn);
  const [confirming, setConfirming] = useState(false);
  return <section className="flex flex-col gap-3" aria-label="Change plan">
    {E.ttl("Change plan")}
    {E.edit("Planned date", date, "date", undefined, { onChange: setDate, disabled: busy, required: true })}
    <CommandFormMessage error={error} />
    {E.act("Reschedule", "primary", undefined, () => onReschedule?.(date), busy || !date || date === plannedOn)}
    {confirming ? <>
      {E.note("Cancel this plan? The record stays in history. No stock or beer is moved.")}
      {E.act("Confirm cancellation", "destructive", undefined, onCancel, busy)}
      {E.act("Keep plan", "info", undefined, () => setConfirming(false), busy)}
    </> : E.act("Cancel plan", "destructive", undefined, () => setConfirming(true), busy)}
  </section>;
}

export type PackagingSourceOccupancy = { occupancy_id: string; vessel_name: string | null; brand_name: string | null; bbl: number };

/** The unstarted run's source-tank picker, shared with its inventory frame. */
export function PackagingSourcePicker({ occupancies, busy = false, error, onPick }: {
  occupancies: PackagingSourceOccupancy[]; busy?: boolean; error?: string | null;
  onPick?: (occupancyId: string) => void;
}) {
  const [occupancyId, setOccupancyId] = useState("");
  return <div className="flex flex-col gap-3">
    {E.pick("Source tank", occupancyId, occupancies.map(occupancy => ({ value: occupancy.occupancy_id, label: `${occupancy.vessel_name ?? "—"} · ${occupancy.brand_name ?? "no brand"} · ${Number(occupancy.bbl)} bbl` })), { onChange: setOccupancyId, disabled: busy, required: true, placeholder: "Choose tank" })}
    <CommandFormMessage error={error} />
    {E.act("Pick source", "primary", undefined, () => onPick?.(occupancyId), busy || !occupancyId)}
  </div>;
}
