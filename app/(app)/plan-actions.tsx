"use client";
import { PlanActions } from "@/components/mgr/views/plan-actions";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function ChangePlan({ kind, id, plannedOn }: { kind: "batch" | "packaging_run"; id: string; plannedOn: string }) {
  const { busy, error, run } = useCommandAction();
  const identity = kind === "batch" ? { batchId: id } : { runId: id };
  return <PlanActions plannedOn={plannedOn} busy={busy} error={error}
    onReschedule={date => { void run(`reschedule_${kind}`, { ...identity, plannedOn: date }); }}
    onCancel={() => { void run(`cancel_${kind}`, identity); }} />;
}
