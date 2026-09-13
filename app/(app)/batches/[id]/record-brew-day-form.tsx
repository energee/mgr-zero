// Bind the shared knockout form to the existing authorized command.
"use client";
import { useState } from "react";
import { BrewDayView } from "@/components/mgr/views/brew-day";
import type { BrewDayViewModel } from "@/lib/mgr/brew-day-view";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function RecordBrewDayForm({ batchId, model }: { batchId: string; model: BrewDayViewModel }) {
  const [values, setValues] = useState({ vesselId: model.vesselId, initialBbl: model.initialBbl, brewedOn: model.brewedOn });
  const { busy, error, run } = useCommandAction();
  return <BrewDayView model={{ ...model, ...values }} busy={busy} error={error}
    onChange={patch => setValues(current => ({ ...current, ...patch }))}
    onRecord={() => { void run("record_brew_day", { batchId, vesselId: values.vesselId, initialBbl: Number(values.initialBbl), brewedOn: values.brewedOn }); }}
  />;
}
