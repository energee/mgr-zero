// Bind the shared knockout form to the existing authorized command.
"use client";
import { useState, type ReactNode } from "react";
import { BrewDayView } from "@/components/mgr/views/brew-day";
import { brewRecordPayload, type BrewDayViewModel } from "@/lib/mgr/brew-day-view";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function RecordBrewDayForm({ batchId, model, planActions }: { batchId: string; model: BrewDayViewModel; planActions?: ReactNode }) {
  const [values, setValues] = useState(model);
  const { busy, error, run } = useCommandAction();
  return <BrewDayView model={{ ...model, ...values }} busy={busy} error={error} planActions={planActions}
    onChange={patch => setValues(current => ({ ...current, ...patch }))}
    onRecord={() => { void run(...brewRecordPayload(values, batchId)); }}
  />;
}
