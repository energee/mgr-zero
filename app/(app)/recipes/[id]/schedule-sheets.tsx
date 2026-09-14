// app/(app)/recipes/[id]/schedule-sheets.tsx — the three draft sheets the
// New version form opens: Mash schedule, Fermentation schedule and Water,
// each listing its items with add, edit, move and delete, and swapping to the
// item editor (Mash step, Fermentation stage, Water addition) in place. They
// edit the form's draft; nothing is written until Save version.
"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter } from "@/components/mgr/command-form";
import { FermentationScheduleView, FermentationStageView, stageReady, toStageFields } from "@/components/mgr/views/fermentation-schedule";
import { MashScheduleView, MashStepView, mashStepReady, toMashStepFields } from "@/components/mgr/views/mash-schedule";
import { WaterAdditionView, WaterView, additionReady, toAdditionFields, type NamedOption } from "@/components/mgr/views/water";
import { moveItem, removeAt, upsertAt, type FermentationStage, type MashStep, type WaterAddition, type WaterDraft } from "@/lib/mgr/recipe-process-view";

/** One list sheet: `editing` is the index being edited, null for a new item, undefined for the list. */
function useEditor<T>() {
  const [editing, setEditing] = useState<number | null | undefined>(undefined);
  return { editing, open: (i: number | null) => setEditing(i), close: () => setEditing(undefined) };
}

function ItemFooter({ onDelete, onSave, ready, label }: { onDelete?: () => void; onSave: () => void; ready: boolean; label: string }) {
  return <CommandFormFooter>
    {onDelete && <Button type="button" variant="outline" onClick={onDelete}>Delete</Button>}
    <Button type="button" disabled={!ready} onClick={onSave}>{label}</Button>
  </CommandFormFooter>;
}

export function MashScheduleSheet({ title, steps, onChange }: { title: string; steps: MashStep[]; onChange: (steps: MashStep[]) => void }) {
  const [open, setOpen] = useState(false);
  const ed = useEditor<MashStep>();
  const [fields, setFields] = useState(toMashStepFields());
  const begin = (i: number | null) => { setFields(toMashStepFields(i === null ? undefined : steps[i])); ed.open(i); };
  const save = () => { onChange(upsertAt(steps, ed.editing ?? undefined, { name: fields.name.trim(), kind: fields.kind, tempF: Number(fields.tempF), minutes: Number(fields.minutes) })); ed.close(); };
  return <CommandForm open={open} onOpenChange={(o) => { setOpen(o); if (!o) ed.close(); }} title="Mash schedule" trigger={<Button type="button" variant="outline" className="justify-start">Mash schedule · {steps.length} steps</Button>}>
    {ed.editing === undefined
      ? <MashScheduleView title={title} steps={steps} onEdit={begin} onMove={(i, by) => onChange(moveItem(steps, i, by))} createAction={<Button type="button" size="sm" onClick={() => begin(null)}>Add step</Button>} />
      : <MashStepView fields={fields} onChange={(p) => setFields((f) => ({ ...f, ...p }))} footer={<ItemFooter label="Save step" ready={mashStepReady(fields)} onSave={save} onDelete={ed.editing === null ? undefined : () => { onChange(removeAt(steps, ed.editing!)); ed.close(); }} />} />}
  </CommandForm>;
}

export function FermentationScheduleSheet({ title, stages, onChange }: { title: string; stages: FermentationStage[]; onChange: (stages: FermentationStage[]) => void }) {
  const [open, setOpen] = useState(false);
  const ed = useEditor<FermentationStage>();
  const [fields, setFields] = useState(toStageFields());
  const begin = (i: number | null) => { setFields(toStageFields(i === null ? undefined : stages[i])); ed.open(i); };
  const save = () => { onChange(upsertAt(stages, ed.editing ?? undefined, { name: fields.name.trim(), kind: fields.kind, tempF: Number(fields.tempF), days: Number(fields.days) })); ed.close(); };
  return <CommandForm open={open} onOpenChange={(o) => { setOpen(o); if (!o) ed.close(); }} title="Fermentation schedule" trigger={<Button type="button" variant="outline" className="justify-start">Fermentation schedule · {stages.length} stages</Button>}>
    {ed.editing === undefined
      ? <FermentationScheduleView title={title} stages={stages} onEdit={begin} onMove={(i, by) => onChange(moveItem(stages, i, by))} createAction={<Button type="button" size="sm" onClick={() => begin(null)}>Add stage</Button>} />
      : <FermentationStageView fields={fields} onChange={(p) => setFields((f) => ({ ...f, ...p }))} footer={<ItemFooter label="Save stage" ready={stageReady(fields)} onSave={save} onDelete={ed.editing === null ? undefined : () => { onChange(removeAt(stages, ed.editing!)); ed.close(); }} />} />}
  </CommandForm>;
}

export function WaterSheet({ title, water, profiles, materials, onChange }: { title: string; water: WaterDraft; profiles: NamedOption[]; materials: NamedOption[]; onChange: (water: WaterDraft) => void }) {
  const [open, setOpen] = useState(false);
  const ed = useEditor<WaterAddition>();
  const [fields, setFields] = useState(toAdditionFields());
  const begin = (i: number | null) => { setFields(toAdditionFields(i === null ? undefined : water.additions[i])); ed.open(i); };
  const setAdditions = (additions: WaterAddition[]) => onChange({ ...water, additions });
  const save = () => { setAdditions(upsertAt(water.additions, ed.editing ?? undefined, { materialId: fields.materialId, qty: Number(fields.qty), unit: fields.unit, stage: fields.stage })); ed.close(); };
  const summary: ReactNode = water.targetProfileId ? `target ${profiles.find((p) => p.id === water.targetProfileId)?.name ?? ""}` : "no target";
  return <CommandForm open={open} onOpenChange={(o) => { setOpen(o); if (!o) ed.close(); }} title="Water" trigger={<Button type="button" variant="outline" className="justify-start">Water · {summary} · {water.additions.length} additions</Button>}>
    {ed.editing === undefined
      ? <WaterView title={title} water={water} profiles={profiles} materials={materials} onChange={(p) => onChange({ ...water, ...p })} onEdit={begin} onAdd={() => begin(null)} onMove={(i, by) => setAdditions(moveItem(water.additions, i, by))} />
      : <WaterAdditionView fields={fields} materials={materials} onChange={(p) => setFields((f) => ({ ...f, ...p }))} footer={<ItemFooter label="Save addition" ready={additionReady(fields)} onSave={save} onDelete={ed.editing === null ? undefined : () => { setAdditions(removeAt(water.additions, ed.editing!)); ed.close(); }} />} />}
  </CommandForm>;
}
