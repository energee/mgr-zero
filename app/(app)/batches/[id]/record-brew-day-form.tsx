// Bind the shared brew-day views to record_brew_day / correct_brew_record:
// RecordBrewTimelineForm for a planned batch's Brew day tab (./prep-form.tsx
// is its Prep tab), RecordBrewDayForm for a recorded or cancelled one
// (history, Correct turn, Add brew turn).
"use client";
import { useState, type ReactNode } from "react";
import { BrewDayView } from "@/components/mgr/views/brew-day";
import { BrewTimelineView } from "@/components/mgr/views/brew-timeline";
import { brewRecordPayload, type BrewDayViewModel } from "@/lib/mgr/brew-day-view";
import { timelineRecordPayload, type BrewTimelineViewModel } from "@/lib/mgr/brew-prep-view";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function RecordBrewDayForm({ batchId, model }: { batchId: string; model: BrewDayViewModel }) {
  const [values, setValues] = useState(model);
  const { busy, error, run } = useCommandAction();
  return <BrewDayView model={{ ...model, ...values }} busy={busy} error={error}
    onChange={patch => setValues(current => ({ ...current, ...patch }))}
    onRecord={() => { void run(...brewRecordPayload(values, batchId)); }}
  />;
}

export function RecordBrewTimelineForm({ batchId, model, planActions, tabHrefs }: { batchId: string; model: BrewTimelineViewModel; planActions?: ReactNode; tabHrefs: Record<string, string> }) {
  const [values, setValues] = useState(model);
  const { busy, error, run } = useCommandAction();
  return <BrewTimelineView model={values} busy={busy} error={error} planActions={planActions} tabHrefs={tabHrefs}
    onChange={patch => setValues(current => ({ ...current, ...patch }))}
    onRecord={() => { void run(...timelineRecordPayload(values, batchId)); }}
  />;
}
