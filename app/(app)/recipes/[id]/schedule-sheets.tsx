// app/(app)/recipes/[id]/schedule-sheets.tsx — the three draft sheets the
// New version form opens: Mash schedule, Fermentation schedule and Water.
// One ListSheet owns the open/close, the list-or-editor swap and the save and
// delete verbs; each sheet supplies its list view, item editor and field
// shape. They edit the form's draft; nothing is written until Save version.
"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter } from "@/components/mgr/command-form";
import { FermentationScheduleView, FermentationStageView } from "@/components/mgr/views/fermentation-schedule";
import { MashScheduleView, MashStepView } from "@/components/mgr/views/mash-schedule";
import { WaterAdditionView, WaterView } from "@/components/mgr/views/water";
import { additionReady, mashStepReady, moveItem, removeAt, stageReady, toAdditionFields, toMashStepFields, toStageFields, upsertAt, type FermentationStage, type MashStep, type SaltMaterial, type WaterAddition, type WaterDraft, type WaterProfileIons } from "@/lib/mgr/recipe-process-view";

type Editing = { index?: number } | null;
type ListProps<T> = { items: T[]; onEdit: (index: number) => void; onMove: (index: number, by: -1 | 1) => void; add: ReactNode; onAdd: () => void };
type ItemProps<F> = { fields: F; onChange: (patch: Partial<F>) => void; footer: ReactNode };

/** An ordered list edited in a sheet: the list until a row is picked or added, then that item's editor in place. */
function ListSheet<T, F>({ sheetTitle, trigger, addLabel, saveLabel, items, onChange, toFields, ready, toItem, list, item }: {
  sheetTitle: string; trigger: string; addLabel: string; saveLabel: string; items: T[]; onChange: (items: T[]) => void;
  toFields: (item?: T) => F; ready: (fields: F) => boolean; toItem: (fields: F) => T; list: (p: ListProps<T>) => ReactNode; item: (p: ItemProps<F>) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [fields, setFields] = useState<F>(() => toFields());
  const begin = (index?: number) => { setFields(toFields(index === undefined ? undefined : items[index])); setEditing({ index }); };
  const footer = editing && <CommandFormFooter>
    {editing.index !== undefined && <Button type="button" variant="outline" onClick={() => { onChange(removeAt(items, editing.index!)); setEditing(null); }}>Delete</Button>}
    <Button type="button" disabled={!ready(fields)} onClick={() => { onChange(upsertAt(items, editing.index, toItem(fields))); setEditing(null); }}>{saveLabel}</Button>
  </CommandFormFooter>;
  return <CommandForm open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }} title={sheetTitle} trigger={<Button type="button" variant="outline" className="justify-start">{trigger}</Button>}>
    {editing === null
      ? list({ items, onEdit: begin, onMove: (i, by) => onChange(moveItem(items, i, by)), onAdd: () => begin(), add: <Button type="button" size="sm" onClick={() => begin()}>{addLabel}</Button> })
      : item({ fields, onChange: (patch) => setFields((f) => ({ ...f, ...patch })), footer })}
  </CommandForm>;
}

export function MashScheduleSheet({ steps, onChange }: { steps: MashStep[]; onChange: (steps: MashStep[]) => void }) {
  return <ListSheet sheetTitle="Mash schedule" trigger={`Mash schedule · ${steps.length} steps`} addLabel="Add step" saveLabel="Save step"
    items={steps} onChange={onChange} toFields={toMashStepFields} ready={mashStepReady}
    toItem={(f) => ({ name: f.name.trim(), kind: f.kind, tempF: Number(f.tempF), minutes: Number(f.minutes) })}
    list={(p) => <MashScheduleView steps={p.items} onEdit={p.onEdit} onMove={p.onMove} createAction={p.add} />}
    item={(p) => <MashStepView fields={p.fields} onChange={p.onChange} footer={p.footer} />} />;
}

export function FermentationScheduleSheet({ stages, onChange }: { stages: FermentationStage[]; onChange: (stages: FermentationStage[]) => void }) {
  return <ListSheet sheetTitle="Fermentation schedule" trigger={`Fermentation schedule · ${stages.length} stages`} addLabel="Add stage" saveLabel="Save stage"
    items={stages} onChange={onChange} toFields={toStageFields} ready={stageReady}
    toItem={(f) => ({ name: f.name.trim(), kind: f.kind, tempF: Number(f.tempF), days: Number(f.days) })}
    list={(p) => <FermentationScheduleView stages={p.items} onEdit={p.onEdit} onMove={p.onMove} createAction={p.add} />}
    item={(p) => <FermentationStageView fields={p.fields} onChange={p.onChange} footer={p.footer} />} />;
}

export function WaterSheet({ water, profiles, materials, onChange }: { water: WaterDraft; profiles: WaterProfileIons[]; materials: SaltMaterial[]; onChange: (water: WaterDraft) => void }) {
  const target = profiles.find((p) => p.id === water.targetProfileId)?.name;
  return <ListSheet<WaterAddition, ReturnType<typeof toAdditionFields>> sheetTitle="Water" trigger={`Water · ${target ? `target ${target}` : "no target"} · ${water.additions.length} additions`} addLabel="Add addition" saveLabel="Save addition"
    items={water.additions} onChange={(additions) => onChange({ ...water, additions })} toFields={toAdditionFields} ready={additionReady}
    toItem={(f) => ({ materialId: f.materialId, qty: Number(f.qty), unit: f.unit, stage: f.stage })}
    list={(p) => <WaterView water={{ ...water, additions: p.items }} profiles={profiles} materials={materials} onChange={(patch) => onChange({ ...water, ...patch })} onEdit={p.onEdit} onMove={p.onMove} onAdd={p.onAdd} />}
    item={(p) => <WaterAdditionView fields={p.fields} materials={materials} onChange={p.onChange} footer={p.footer} />} />;
}
