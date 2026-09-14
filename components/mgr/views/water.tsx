// components/mgr/views/water.tsx — Water (what a version starts from, aims
// at, and what goes in it) and Water addition (one salt or acid). The source
// profile is the brewery default unless the version overrides it.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { WATER_ADDITION_STAGES, WATER_ADDITION_UNITS } from "@/lib/commands/production";
import { ionReadout, suggestAdditions, type SaltMaterial, type WaterAdditionFields, type WaterDraft, type WaterProfileIons } from "@/lib/mgr/recipe-process-view";
import type { Ions } from "@/lib/water-chemistry";
import { rowVerbs, type ListRowProps } from "./mash-schedule";

export type NamedOption = { id: string; name: string };

export function WaterView({ title = "Water", water, profiles, materials, sourceDefault, onChange, onAdd, ...verbs }: {
  title?: string; water: WaterDraft; profiles: WaterProfileIons[]; materials: SaltMaterial[]; sourceDefault?: Ions;
  onChange?: (patch: Partial<WaterDraft>) => void; onAdd?: () => void;
} & ListRowProps) {
  const bind = (key: "targetProfileId" | "sourceProfileId" | "mashGal" | "spargeGal" | "targetMashPh") => onChange ? { value: water[key] } : { defaultValue: water[key] };
  const name = (list: NamedOption[], id: string) => list.find((x) => x.id === id)?.name ?? id;
  // Chemistry needs a salt identity on materials; until the schema carries one the verb and read-out draw gated, never guessed from a name.
  const chemistryKnown = materials.some((m) => m.salt !== undefined);
  const target = profiles.find((p) => p.id === water.targetProfileId)?.ions;
  const source = water.sourceProfileId ? profiles.find((p) => p.id === water.sourceProfileId)?.ions : sourceDefault;
  const totalGal = (Number(water.mashGal) || 0) + (Number(water.spargeGal) || 0);
  const canSuggest = Boolean(target && source && totalGal > 0);
  const readout = target && source ? ionReadout(water, source, target, materials) : [];
  return <>
    {E.back("Recipe", title)}
    <Field><FieldLabel>Source profile</FieldLabel><select aria-label="Source profile" className={E.select} {...bind("sourceProfileId")} onChange={(e) => onChange?.({ sourceProfileId: e.target.value })}>
      <option value="">brewery default</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></Field>
    <Field><FieldLabel>Target profile</FieldLabel><select aria-label="Target profile" className={E.select} {...bind("targetProfileId")} onChange={(e) => onChange?.({ targetProfileId: e.target.value })}>
      <option value="">No target</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></Field>
    {E.cols(
      <Field><FieldLabel>Mash water gal</FieldLabel><Input aria-label="Mash water gal" type="number" min="0" step="any" {...bind("mashGal")} onChange={(e) => onChange?.({ mashGal: e.target.value })} /></Field>,
      <Field><FieldLabel>Sparge water gal</FieldLabel><Input aria-label="Sparge water gal" type="number" min="0" step="any" {...bind("spargeGal")} onChange={(e) => onChange?.({ spargeGal: e.target.value })} /></Field>,
    )}
    <Field><FieldLabel>Target mash pH</FieldLabel><Input aria-label="Target mash pH" type="number" min="4" max="7" step="0.01" {...bind("targetMashPh")} onChange={(e) => onChange?.({ targetMashPh: e.target.value })} /></Field>
    {E.ttl("Salts and acids")}
    {water.additions.map((a, i) => <div key={`${i}-${a.materialId}`}>{E.row(name(materials, a.materialId), `${a.qty} ${a.unit} · ${a.stage}`, rowVerbs(i, water.additions.length, verbs))}</div>)}
    {E.row("Add addition", "material · amount · stage", E.act("Add", "primary", undefined, onAdd))}
    {chemistryKnown
      ? canSuggest
        ? E.act("Suggest additions", "primary", undefined, () => target && source && onChange?.({ additions: suggestAdditions(water, source, target, materials) }))
        : E.btn("Suggest additions", "g disabled")
      : E.gated("Suggest additions", "arrives with the material salt field")}
    {chemistryKnown && readout.length > 0 && <>
      {E.ttl("Against target")}
      {readout.map((r) => <div key={r.ion}>{E.row(r.ion, r.detail, "", r.warning ? "w" : "")}</div>)}
    </>}
    {!chemistryKnown && target && source && E.gated("Ion read-out", "arrives with the material salt field")}
  </>;
}


export function WaterAdditionView({ fields, materials, onChange, footer }: { fields: WaterAdditionFields; materials: NamedOption[]; onChange?: (patch: Partial<WaterAdditionFields>) => void; footer?: ReactNode }) {
  const bind = (key: keyof WaterAdditionFields) => onChange ? { value: fields[key] } : { defaultValue: fields[key] };
  return <>
    <Field><FieldLabel>Material</FieldLabel><select aria-label="Material" required className={E.select} {...bind("materialId")} onChange={(e) => onChange?.({ materialId: e.target.value })}>
      <option value="">Salt or acid</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select></Field>
    {E.inline(
      <Field><FieldLabel>Amount</FieldLabel><Input aria-label="Amount" type="number" min="0" step="any" required {...bind("qty")} onChange={(e) => onChange?.({ qty: e.target.value })} /></Field>,
      <Field><FieldLabel>Unit</FieldLabel><select aria-label="Unit" className={E.select} {...bind("unit")} onChange={(e) => onChange?.({ unit: e.target.value })}>{WATER_ADDITION_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></Field>,
    )}
    <Field><FieldLabel>Stage</FieldLabel><select aria-label="Stage" className={E.select} {...bind("stage")} onChange={(e) => onChange?.({ stage: e.target.value })}>{WATER_ADDITION_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select></Field>
    {footer !== undefined ? footer : E.btns([["Delete addition", "g"], "Save addition"])}
  </>;
}
