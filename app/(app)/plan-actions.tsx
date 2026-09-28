"use client";
import { PlanActions } from "@/components/mgr/views/plan-actions";
import { useCommandAction } from "@/lib/commands/use-command-form";

// Binds the shared PlanActions to the reschedule/cancel commands of one plan kind.

const COMMANDS = {
  batch: { reschedule: "reschedule_batch", cancel: "cancel_batch", idKey: "batchId" },
  packaging_run: { reschedule: "reschedule_packaging_run", cancel: "cancel_packaging_run", idKey: "runId" },
} as const;

export function ChangePlan({ kind, id, plannedOn }: { kind: keyof typeof COMMANDS; id: string; plannedOn: string }) {
  const { busy, error, run } = useCommandAction();
  const { reschedule, cancel, idKey } = COMMANDS[kind];
  return <PlanActions plannedOn={plannedOn} busy={busy} error={error}
    onReschedule={date => { void run(reschedule, { [idKey]: id, plannedOn: date }); }}
    onCancel={() => { void run(cancel, { [idKey]: id }); }} />;
}
