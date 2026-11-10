// app/(app)/recipes/[id]/schedule-sheets.tsx — the draft sheets the Recipe
// editor opens: Ingredient, Mash schedule, Fermentation schedule, Water and
// Recipe numbers. One ListSheet owns the open/close, the list-or-editor swap
// and the save and delete verbs; each list sheet supplies its list view, item
// editor and field shape. `trigger` is the button RecipeView drew (a line's
// name, Add ingredient, a schedule's action), so the editor looks like the
// inventory drawing. Water and Recipe numbers are also opened by the facts the
// page draws, so the editor holds whether each is open. They edit the editor's
// draft; nothing is written until Save changes.
"use client";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { asTrigger, CommandForm, CommandFormFooter } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { FermentationScheduleView, FermentationStageView } from "@/components/mgr/views/fermentation-schedule";
import { IngredientView, type IngredientMaterial } from "@/components/mgr/views/ingredient";
import { RecipeNumbersView, type RecipeNumberField } from "@/components/mgr/views/recipe-numbers";
import { MashScheduleView, MashStepView } from "@/components/mgr/views/mash-schedule";
import { WaterAdditionView, WaterView } from "@/components/mgr/views/water";
import { additionReason, fromIngredientFields, mashStepReason, moveItem, removeAt, stageReason, toAdditionFields, toIngredientFields, toMashStepFields, toStageFields, upsertAt, type FermentationStage, type IngredientFields, type IngredientLine, type IngredientStage, type MashStep, type TimingLimits, type SaltMaterial, type WaterAddition, type WaterDraft, type WaterProfileIons } from "@/lib/mgr/recipe-process-view";

type Editing = { index?: number } | null;
type ListProps<T> = { items: T[]; onEdit: (index: number) => void; onMove: (index: number, by: -1 | 1) => void; add: ReactNode; onAdd: () => void };
type ItemProps<F> = { fields: F; onChange: (patch: Partial<F>) => void; footer: ReactNode };

/** A sheet whose caller holds whether it is open, because something besides its trigger opens it too. */
type Opened = { open: boolean; onOpenChange: (open: boolean) => void };

/** An ordered list edited in a sheet: the list until a row is picked or added, then that item's editor in place.
 *  `reason` says why Save is withheld, or null when the fields are ready. Without `opened` the sheet opens from its trigger alone. */
function ListSheet<T, F>({ sheetTitle, trigger, opened, addLabel, saveLabel, items, onChange, toFields, reason, toItem, list, item }: {
  sheetTitle: string; trigger: ReactNode; opened?: Opened; addLabel: string; saveLabel: string; items: T[]; onChange: (items: T[]) => void;
  toFields: (item?: T) => F; reason: (fields: F) => string | null; toItem: (fields: F) => T; list: (p: ListProps<T>) => ReactNode; item: (p: ItemProps<F>) => ReactNode;
}) {
  const [own, setOwn] = useState(false);
  const { open, onOpenChange: setOpen } = opened ?? { open: own, onOpenChange: setOwn };
  const [editing, setEditing] = useState<Editing>(null);
  const [fields, setFields] = useState<F>(() => toFields());
  const [body, setBody] = useState<HTMLDivElement | null>(null); // a state ref: `move` reads it, and lint forbids reading a ref during render
  // After a move, keep focus on the moved row: on the arrow that moved it, or on its Edit once that arrow is gone
  // (the row reached an end). The rows re-render first, so the lookup waits a frame (the composer.tsx precedent).
  const move = (index: number, by: -1 | 1) => {
    onChange(moveItem(items, index, by));
    requestAnimationFrame(() => {
      const row = body?.querySelector(`[data-row-index="${index + by}"]`);
      (row?.querySelector<HTMLElement>(`[data-move="${by}"]`) ?? row?.querySelector<HTMLElement>("[data-row-action]"))?.focus();
    });
  };
  const begin = (index?: number) => { setFields(toFields(index === undefined ? undefined : items[index])); setEditing({ index }); };
  const footer = editing && <CommandFormFooter>
    {editing.index !== undefined && <Button type="button" variant="outline" onClick={() => { onChange(removeAt(items, editing.index!)); setEditing(null); }}>Delete</Button>}
    {E.submit(saveLabel, { type: "button", reason: reason(fields), onClick: () => { onChange(upsertAt(items, editing.index, toItem(fields))); setEditing(null); } })}
  </CommandFormFooter>;
  return <CommandForm open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }} title={sheetTitle} trigger={asTrigger(trigger)}>
    <div ref={setBody} className="flex flex-col gap-4">
      {editing === null
        ? list({ items, onEdit: begin, onMove: move, onAdd: () => begin(), add: <Button type="button" size="sm" onClick={() => begin()}>{addLabel}</Button> })
        : item({ fields, onChange: (patch) => setFields((f) => ({ ...f, ...patch })), footer })}
    </div>
  </CommandForm>;
}

export function MashScheduleSheet({ steps, onChange, trigger }: { steps: MashStep[]; onChange: (steps: MashStep[]) => void; trigger: ReactNode }) {
  return <ListSheet sheetTitle="Mash schedule" trigger={trigger} addLabel="Add step" saveLabel="Save step"
    items={steps} onChange={onChange} toFields={toMashStepFields} reason={mashStepReason}
    toItem={(f) => ({ name: f.name.trim(), kind: f.kind, tempF: Number(f.tempF), minutes: Number(f.minutes) })}
    list={(p) => <MashScheduleView steps={p.items} onEdit={p.onEdit} onMove={p.onMove} header={p.add} />}
    item={(p) => <MashStepView fields={p.fields} onChange={p.onChange} footer={p.footer} />} />;
}

export function FermentationScheduleSheet({ stages, onChange, trigger }: { stages: FermentationStage[]; onChange: (stages: FermentationStage[]) => void; trigger: ReactNode }) {
  return <ListSheet sheetTitle="Fermentation schedule" trigger={trigger} addLabel="Add stage" saveLabel="Save stage"
    items={stages} onChange={onChange} toFields={toStageFields} reason={stageReason}
    toItem={(f) => ({ name: f.name.trim(), kind: f.kind, tempF: Number(f.tempF), days: Number(f.days) })}
    list={(p) => <FermentationScheduleView stages={p.items} onEdit={p.onEdit} onMove={p.onMove} header={p.add} />}
    item={(p) => <FermentationStageView fields={p.fields} onChange={p.onChange} footer={p.footer} />} />;
}

/** `open` is the editor's: Edit water opens the sheet, and so does each water fact and water row on the page. */
export function WaterSheet({ water, profiles, materials, onChange, trigger, ...opened }: { water: WaterDraft; profiles: WaterProfileIons[]; materials: SaltMaterial[]; onChange: (water: WaterDraft) => void; trigger: ReactNode } & Opened) {
  return <ListSheet<WaterAddition, ReturnType<typeof toAdditionFields>> sheetTitle="Water" trigger={trigger} opened={opened} addLabel="Add addition" saveLabel="Save addition"
    items={water.additions} onChange={(additions) => onChange({ ...water, additions })} toFields={toAdditionFields} reason={additionReason}
    toItem={(f) => ({ materialId: f.materialId, qty: Number(f.qty), unit: f.unit, stage: f.stage })}
    list={(p) => <WaterView water={{ ...water, additions: p.items }} profiles={profiles} materials={materials} profilesHref="/catalog/water-profiles" chemistryKnown={false /* until materials carry a salt identity (PR B) */} header={null} onChange={(patch) => onChange({ ...water, ...patch })} onEdit={p.onEdit} onMove={p.onMove} onAdd={p.onAdd} />}
    item={(p) => <WaterAdditionView fields={p.fields} materials={materials} materialsHref="/materials" onChange={p.onChange} footer={p.footer} />} />;
}

/** One ingredient, edited in place: a step's Add ingredient opens a blank editor on that step's `stage`, a line's name opens it
 *  filled from `line`. No list of its own; the recipe page is the list. `batchBbl` is the draft's batch size (0 for none):
 *  with one, a material with a pack size can be typed as a count of packs. */
export function IngredientSheet({ line, stage = "mash", materials, limits, batchBbl, onSave, onDelete, trigger }: { line?: IngredientLine; stage?: IngredientStage; materials: IngredientMaterial[]; limits: TimingLimits; batchBbl: number; onSave: (line: IngredientLine) => void; onDelete?: () => void; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const start = line ?? { materialId: "", perBblQty: "", stage, timingMinutes: "" };
  // Timing is edited in the stage's unit (days or minutes) and stored as minutes on save (#1478).
  const [f, setF] = useState<IngredientFields>(toIngredientFields(start));
  const patch = (p: Partial<IngredientFields>) => setF((c) => ({ ...c, ...p }));
  return <CommandForm open={open} onOpenChange={(o) => { setOpen(o); if (o) setF(toIngredientFields(start)); }} title={line ? "Edit ingredient" : "Add ingredient"} trigger={asTrigger(trigger)}>
    <div className="flex flex-col gap-4">
      <IngredientView fields={f} materials={materials} limits={limits} batchBbl={batchBbl} onChange={patch}
        onSave={() => { onSave(fromIngredientFields(f)); setOpen(false); }}
        onDelete={onDelete ? () => { onDelete(); setOpen(false); } : null}
      />
    </div>
  </CommandForm>;
}

/** The batch size and the eight process numbers in one sheet. Each field changes the editor's draft as it is typed, as
 *  the Water sheet's own fields do, so there is no Save here. `open` is the editor's: Edit recipe numbers opens the
 *  sheet, and so does every number the page reads out. */
export function RecipeNumbersSheet({ values, onChange, trigger, open, onOpenChange }: { values: Record<RecipeNumberField, string>; onChange: (field: RecipeNumberField, value: string) => void; trigger: ReactNode } & Opened) {
  return <CommandForm open={open} onOpenChange={onOpenChange} title="Recipe numbers" trigger={asTrigger(trigger)}>
    <RecipeNumbersView values={values} onChange={onChange} />
  </CommandForm>;
}
