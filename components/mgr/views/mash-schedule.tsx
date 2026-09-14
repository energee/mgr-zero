// components/mgr/views/mash-schedule.tsx — Mash schedule (the ordered rests)
// and Mash step (one rest). Inventory draws fixtures with no onChange; the
// live sheet (recipes/[id]/mash-schedule-sheet.tsx) edits a draft version.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MASH_STEP_KINDS } from "@/lib/commands/production";
import { isNumber, isPositive, mashSummary, type MashStep } from "@/lib/mgr/recipe-process-view";

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

export type MashStepFields = { name: string; kind: string; tempF: string; minutes: string };
export const toMashStepFields = (s?: MashStep): MashStepFields => ({ name: s?.name ?? "", kind: s?.kind ?? "infusion", tempF: s ? String(s.tempF) : "", minutes: s ? String(s.minutes) : "" });
export const mashStepReady = (f: MashStepFields) => f.name.trim() !== "" && isNumber(f.tempF) && isPositive(f.minutes);

export function MashStepView({ fields, onChange, footer }: { fields: MashStepFields; onChange?: (patch: Partial<MashStepFields>) => void; footer?: ReactNode }) {
  const bind = (key: keyof MashStepFields) => onChange ? { value: fields[key] } : { defaultValue: fields[key] };
  return <>
    <Field><FieldLabel>Step name</FieldLabel><Input aria-label="Step name" required {...bind("name")} onChange={(e) => onChange?.({ name: e.target.value })} /></Field>
    <Field><FieldLabel>Type</FieldLabel><select aria-label="Type" className={E.select} {...bind("kind")} onChange={(e) => onChange?.({ kind: e.target.value })}>{MASH_STEP_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
    {E.cols(
      <Field><FieldLabel>Temp °F</FieldLabel><Input aria-label="Temp °F" type="number" step="any" required {...bind("tempF")} onChange={(e) => onChange?.({ tempF: e.target.value })} /></Field>,
      <Field><FieldLabel>Duration min</FieldLabel><Input aria-label="Duration min" type="number" min="1" step="1" required {...bind("minutes")} onChange={(e) => onChange?.({ minutes: e.target.value })} /></Field>,
    )}
    {footer !== undefined ? footer : E.btns([["Delete step", "g"], "Save step"])}
  </>;
}
