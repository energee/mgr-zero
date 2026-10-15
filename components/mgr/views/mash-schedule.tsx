// components/mgr/views/mash-schedule.tsx — Mash schedule (the ordered rests)
// and Mash step (one rest). Inventory draws fixtures with no onChange; the
// live sheet (recipes/[id]/mash-schedule-sheet.tsx) edits a draft version.
"use client";
import { Fragment, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { MASH_STEP_KINDS } from "@/lib/mgr/enums";
import { mashStepDetail, mashSummary, type MashStep, type MashStepFields } from "@/lib/mgr/recipe-process-view";

/** The verbs every ordered-list row carries: Edit, and move up or down while a draft is open. */
export type ListRowProps = { onEdit?: (index: number) => void; onMove?: (index: number, by: -1 | 1) => void };

/** One row of an ordered list. Live (`onEdit`), a tap anywhere on the row opens its editor, except a tap on one of its
 *  buttons; the arrows and Edit carry the row title so a screen reader hears which row they move or open. Inventory
 *  draws a plain Edit. `data-row-index` on the row and `data-move` on each arrow let the sheet put focus back on the
 *  moved row's arrow after a move. */
export function listRow(title: string, detail: string, index: number, count: number, { onEdit, onMove }: ListRowProps) {
  if (!onEdit) return E.row(title, detail, E.act("Edit"));
  const arrow = (by: -1 | 1) => <Button type="button" variant="ghost" size="icon-sm" data-move={by} onClick={() => onMove!(index, by)} aria-label={`Move ${title} ${by < 0 ? "up" : "down"}`}>{by < 0 ? "↑" : "↓"}</Button>;
  return <div data-row-index={index} onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) onEdit(index); }}>
    {E.row(title, detail, <span className="flex gap-1">
      {onMove && index > 0 && arrow(-1)}
      {onMove && index < count - 1 && arrow(1)}
      {E.act(<>Edit<span className="sr-only"> {title}</span></>, "primary", undefined, () => onEdit(index))}
    </span>)}
  </div>;
}

/** `back` replaces the whole header: the live sheet passes its Add button (the sheet already says the title), the inventory omits it. */
export function MashScheduleView({ title = "Mash schedule", steps, back, ...verbs }: { title?: string; steps: readonly MashStep[]; back?: ReactNode } & ListRowProps) {
  return <>
    {back !== undefined ? back : E.back("Recipe", title, E.btn("Add step"))}
    {steps.length === 0 ? E.blank({ title: "No steps yet", description: "Add step is the only action." })
      : steps.map((s, i) => <Fragment key={`${i}-${s.name}`}>{listRow(s.name, mashStepDetail(s), i, steps.length, verbs)}</Fragment>)}
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
