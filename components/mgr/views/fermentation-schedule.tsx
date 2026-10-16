// components/mgr/views/fermentation-schedule.tsx — Fermentation schedule (the
// temperatures and days a batch holds) and Fermentation stage (one of them).
// Same shape as mash-schedule.tsx; the live sheet edits a draft version.
"use client";
import { Fragment, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { FERMENTATION_STAGE_KINDS } from "@/lib/mgr/enums";
import { fermentationSummary, type FermentationStage, type FermentationStageFields } from "@/lib/mgr/recipe-process-view";
import { listRow, type ListRowProps } from "./mash-schedule";

/** `header` replaces the whole header row, as on MashScheduleView: undefined keeps the default E.back, null draws none. */
export function FermentationScheduleView({ title = "Fermentation schedule", stages, dryHopDay, header, ...verbs }: { title?: string; stages: readonly FermentationStage[]; dryHopDay?: number; header?: ReactNode } & ListRowProps) {
  return <>
    {header !== undefined ? header : E.back("Recipe", title, E.btn("Add stage"))}
    {stages.length === 0 ? E.blank({ title: "No stages yet", description: "Add stage is the only action." })
      : stages.map((s, i) => <Fragment key={`${i}-${s.name}`}>{listRow(s.name, `${s.tempF} °F · ${s.days} days`, i, stages.length, verbs)}</Fragment>)}
    {stages.length > 0 && E.info(fermentationSummary(stages, dryHopDay))}
  </>;
}


export function FermentationStageView({ fields, onChange, footer }: { fields: FermentationStageFields; onChange?: (patch: Partial<FermentationStageFields>) => void; footer?: ReactNode }) {
  return <>
    {E.edit("Stage name", fields.name, "text", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ name: nextValue }) : undefined, required: true })}
    {E.pick("Stage", fields.kind, (FERMENTATION_STAGE_KINDS.map(k => ({ value: k, label: k }))), { onChange: onChange ? (nextValue: string) => onChange?.({ kind: nextValue }) : undefined })}
    {E.cols(
      E.edit("Temp °F", fields.tempF, "number", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ tempF: nextValue }) : undefined, required: true, step: "any" }),
      E.edit("Duration days", fields.days, "number", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ days: nextValue }) : undefined, required: true, min: "0", step: "any" }),
    )}
    {footer !== undefined ? footer : E.btns([["Delete stage", "g"], "Save stage"])}
  </>;
}
