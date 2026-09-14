// components/mgr/views/fermentation-schedule.tsx — Fermentation schedule (the
// temperatures and days a batch holds) and Fermentation stage (one of them).
// Same shape as mash-schedule.tsx; the live sheet edits a draft version.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FERMENTATION_STAGE_KINDS } from "@/lib/commands/production";
import { fermentationSummary, type FermentationStage } from "@/lib/mgr/recipe-process-view";
import { RowVerbs } from "./mash-schedule";

export function FermentationScheduleView({ title, stages, dryHopDay, onEdit, onMove, createAction }: {
  title: string; stages: readonly FermentationStage[]; dryHopDay?: number; onEdit?: (index: number) => void; onMove?: (index: number, by: -1 | 1) => void; createAction?: ReactNode;
}) {
  return <>
    {E.back("Recipe", title, createAction !== undefined ? createAction : E.btn("Add stage"))}
    {stages.length === 0 ? E.blank({ title: "No stages yet", description: "Add stage is the only action." }) : stages.map((s, i) => (
      <div key={`${i}-${s.name}`}>{E.row(s.name, `${s.tempF} °F · ${s.days} days`, <RowVerbs onEdit={onEdit && (() => onEdit(i))} onUp={onMove && i > 0 ? () => onMove(i, -1) : undefined} onDown={onMove && i < stages.length - 1 ? () => onMove(i, 1) : undefined} />)}</div>
    ))}
    {E.info(fermentationSummary(stages, dryHopDay))}
  </>;
}

export type FermentationStageFields = { name: string; kind: string; tempF: string; days: string };
export const toStageFields = (s?: FermentationStage): FermentationStageFields => ({ name: s?.name ?? "", kind: s?.kind ?? "primary", tempF: s ? String(s.tempF) : "", days: s ? String(s.days) : "" });
export const stageReady = (f: FermentationStageFields) => f.name.trim() !== "" && f.tempF !== "" && Number.isFinite(Number(f.tempF)) && Number(f.days) > 0;

const SELECT = "min-w-0 rounded border bg-background p-2";
export function FermentationStageView({ fields, onChange, footer }: { fields: FermentationStageFields; onChange?: (patch: Partial<FermentationStageFields>) => void; footer?: ReactNode }) {
  const bind = (key: keyof FermentationStageFields) => onChange ? { value: fields[key] } : { defaultValue: fields[key] };
  return <>
    <Field><FieldLabel>Stage name</FieldLabel><Input aria-label="Stage name" required {...bind("name")} onChange={(e) => onChange?.({ name: e.target.value })} /></Field>
    <Field><FieldLabel>Stage</FieldLabel><select aria-label="Stage" className={SELECT} {...bind("kind")} onChange={(e) => onChange?.({ kind: e.target.value })}>{FERMENTATION_STAGE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
    {E.cols(
      <Field><FieldLabel>Temp °F</FieldLabel><Input aria-label="Temp °F" type="number" step="any" required {...bind("tempF")} onChange={(e) => onChange?.({ tempF: e.target.value })} /></Field>,
      <Field><FieldLabel>Duration days</FieldLabel><Input aria-label="Duration days" type="number" min="0" step="any" required {...bind("days")} onChange={(e) => onChange?.({ days: e.target.value })} /></Field>,
    )}
    {footer !== undefined ? footer : E.btns([["Delete stage", "g"], "Save stage"])}
  </>;
}
