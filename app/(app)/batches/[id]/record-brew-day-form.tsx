// Bind the shared knockout form to the existing authorized command.
"use client";
import { useState, type ReactNode } from "react";
import { BrewDayView } from "@/components/mgr/views/brew-day";
import { brewActualPayload, type BrewDayViewModel } from "@/lib/mgr/brew-day-view";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function RecordBrewDayForm({ batchId, model, planActions }: { batchId: string; model: BrewDayViewModel; planActions?: ReactNode }) {
  const [values, setValues] = useState(model);
  const { busy, error, run } = useCommandAction();
  return <BrewDayView model={{ ...model, ...values }} busy={busy} error={error} planActions={planActions}
    onChange={patch => setValues(current => ({ ...current, ...patch }))}
    onRecord={() => {
      const actuals = brewActualPayload(values), process = Object.fromEntries(Object.entries(values.process ?? {}).filter(([, value]) => value !== "").map(([key, value]) => [key, Number(value)]));
      const facts = { initialBbl: Number(values.initialBbl), actuals, process, confirmEmpty: Boolean(values.confirmEmpty) };
      void run(values.correctionRecordId ? "correct_brew_record" : "record_brew_day", values.correctionRecordId
        ? { ...facts, recordId: values.correctionRecordId, reason: values.correctionReason }
        : { ...facts, batchId, vesselId: values.vesselId, brewedOn: values.brewedOn });
    }}
  />;
}
