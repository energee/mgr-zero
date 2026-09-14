// components/mgr/views/mash-schedule.tsx — Mash schedule (the ordered rests)
// and Mash step (one rest). Inventory draws fixtures with no onChange; the
// live sheet (recipes/[id]/mash-schedule-sheet.tsx) edits a draft version.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MASH_STEP_KINDS } from "@/lib/commands/production";
import { mashSummary, type MashStep } from "@/lib/mgr/recipe-process-view";

export function MashScheduleView({ title, steps, onEdit, onMove, createAction }: {
  title: string; steps: readonly MashStep[]; onEdit?: (index: number) => void; onMove?: (index: number, by: -1 | 1) => void; createAction?: ReactNode;
}) {
  return <>
    {E.back("Recipe", title, createAction !== undefined ? createAction : E.btn("Add step"))}
    {steps.length === 0 ? E.blank({ title: "No steps yet", description: "Add step is the only action." }) : steps.map((s, i) => (
      <div key={`${i}-${s.name}`}>{E.row(s.name, `${s.kind} · ${s.tempF} °F · ${s.minutes} min`, <RowVerbs onEdit={onEdit && (() => onEdit(i))} onUp={onMove && i > 0 ? () => onMove(i, -1) : undefined} onDown={onMove && i < steps.length - 1 ? () => onMove(i, 1) : undefined} />)}</div>
    ))}
    {E.info(mashSummary(steps))}
  </>;
}

/** Edit plus the two reorder verbs; the inventory shows Edit alone. */
export function RowVerbs({ onEdit, onUp, onDown }: { onEdit?: () => void; onUp?: () => void; onDown?: () => void }) {
  if (!onEdit) return E.act("Edit");
  return <span className="flex gap-1">
    {onUp && <button type="button" onClick={onUp} className="rounded px-2 text-sm text-muted-foreground hover:bg-muted" aria-label="Move up">↑</button>}
    {onDown && <button type="button" onClick={onDown} className="rounded px-2 text-sm text-muted-foreground hover:bg-muted" aria-label="Move down">↓</button>}
    <button type="button" onClick={onEdit} data-row-action data-tap className="rounded bg-primary/10 px-3 py-1 text-sm text-primary hover:bg-primary/20">Edit</button>
  </span>;
}

export type MashStepFields = { name: string; kind: string; tempF: string; minutes: string };
export const toMashStepFields = (s?: MashStep): MashStepFields => ({ name: s?.name ?? "", kind: s?.kind ?? "infusion", tempF: s ? String(s.tempF) : "", minutes: s ? String(s.minutes) : "" });
export const mashStepReady = (f: MashStepFields) => f.name.trim() !== "" && Number.isFinite(Number(f.tempF)) && f.tempF !== "" && Number(f.minutes) > 0;

const SELECT = "min-w-0 rounded border bg-background p-2";
export function MashStepView({ fields, onChange, footer }: { fields: MashStepFields; onChange?: (patch: Partial<MashStepFields>) => void; footer?: ReactNode }) {
  const bind = (key: keyof MashStepFields) => onChange ? { value: fields[key] } : { defaultValue: fields[key] };
  return <>
    <Field><FieldLabel>Step name</FieldLabel><Input aria-label="Step name" required {...bind("name")} onChange={(e) => onChange?.({ name: e.target.value })} /></Field>
    <Field><FieldLabel>Type</FieldLabel><select aria-label="Type" className={SELECT} {...bind("kind")} onChange={(e) => onChange?.({ kind: e.target.value })}>{MASH_STEP_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
    {E.cols(
      <Field><FieldLabel>Temp °F</FieldLabel><Input aria-label="Temp °F" type="number" step="any" required {...bind("tempF")} onChange={(e) => onChange?.({ tempF: e.target.value })} /></Field>,
      <Field><FieldLabel>Duration min</FieldLabel><Input aria-label="Duration min" type="number" min="1" step="1" required {...bind("minutes")} onChange={(e) => onChange?.({ minutes: e.target.value })} /></Field>,
    )}
    {footer !== undefined ? footer : E.btns([["Delete step", "g"], "Save step"])}
  </>;
}
