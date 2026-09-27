"use client";
import { useState } from "react";
import { E } from "@/components/mgr/e";
import { CommandFormMessage } from "@/components/mgr/command-form";

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

/** The unstarted run's source picker and Start action, shared with its inventory frame. */
export function PackagingSource({ occupancies = [], sourcePicked = false, busy = false, error, onPick, onStart }: {
  occupancies?: PackagingSourceOccupancy[]; sourcePicked?: boolean; busy?: boolean; error?: string | null;
  onPick?: (occupancyId: string) => void; onStart?: () => void;
}) {
  const [occupancyId, setOccupancyId] = useState("");
  return <div className="flex flex-col gap-3">
    {!sourcePicked && E.pick("Source tank", occupancyId, occupancies.map(occupancy => ({ value: occupancy.occupancy_id, label: `${occupancy.vessel_name ?? "—"} · ${occupancy.brand_name ?? "no brand"} · ${Number(occupancy.bbl)} bbl` })), { onChange: setOccupancyId, disabled: busy, required: true, placeholder: "Choose tank" })}
    <CommandFormMessage error={error} />
    {sourcePicked
      ? E.act("Start", "primary", undefined, onStart, busy)
      : E.act("Pick source", "primary", undefined, () => onPick?.(occupancyId), busy || !occupancyId)}
  </div>;
}
