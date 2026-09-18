// components/mgr/views/mash-schedule.tsx — Mash schedule (the ordered rests)
// and Mash step (one rest). Inventory draws fixtures with no onChange; the
// live sheet (recipes/[id]/mash-schedule-sheet.tsx) edits a draft version.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { MASH_STEP_KINDS } from "@/lib/mgr/enums";
import { mashSummary, type MashStep, type MashStepFields } from "@/lib/mgr/recipe-process-view";

/** The verbs every ordered-list row carries: Edit, and move up or down while a draft is open. */
export type ListRowProps = { onEdit?: (index: number) => void; onMove?: (index: number, by: -1 | 1) => void };
export function rowVerbs(index: number, count: number, { onEdit, onMove }: ListRowProps) {
  if (!onEdit) return E.act("Edit");
  return <span className="flex gap-1">
    {onMove && index > 0 && <button type="button" onClick={() => onMove(index, -1)} className="rounded px-2 text-sm text-muted-foreground hover:bg-muted" aria-label="Move up">↑</button>}
    {onMove && index < count - 1 && <button type="button" onClick={() => onMove(index, 1)} className="rounded px-2 text-sm text-muted-foreground hover:bg-muted" aria-label="Move down">↓</button>}
    {E.act("Edit", "primary", undefined, () => onEdit(index))}
  </span>;
}

export function MashScheduleView({ title = "Mash schedule", steps, createAction, ...verbs }: { title?: string; steps: readonly MashStep[]; createAction?: ReactNode } & ListRowProps) {
  return <>
    {E.back("Recipe", title, createAction !== undefined ? createAction : E.btn("Add step"))}
    {steps.length === 0 ? E.blank({ title: "No steps yet", description: "Add step is the only action." })
      : steps.map((s, i) => <div key={`${i}-${s.name}`}>{E.row(s.name, `${s.kind} · ${s.tempF} °F · ${s.minutes} min`, rowVerbs(i, steps.length, verbs))}</div>)}
    {E.info(mashSummary(steps))}
  </>;
}


export function MashStepView({ fields, onChange, footer }: { fields: MashStepFields; onChange?: (patch: Partial<MashStepFields>) => void; footer?: ReactNode }) {
  return <>
    {E.edit("Step name", fields.name, "text", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ name: nextValue }) : undefined, required: true })}
    {E.pick("Type", fields.kind, (MASH_STEP_KINDS.map(k => ({ value: k, label: k }))), { onChange: onChange ? (nextValue: string) => onChange?.({ kind: nextValue }) : undefined })}
    {E.cols(
      E.edit("Temp °F", fields.tempF, "number", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ tempF: nextValue }) : undefined, required: true, step: "any" }),
      E.edit("Duration min", fields.minutes, "number", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ minutes: nextValue }) : undefined, required: true, min: "1", step: "1" }),
    )}
    {footer !== undefined ? footer : E.btns([["Delete step", "g"], "Save step"])}
  </>;
}
