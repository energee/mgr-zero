// components/mgr/views/water.tsx — Water (what a version starts from, aims
// at, and what goes in it) and Water addition (one salt or acid). The source
// profile is the brewery default unless the version overrides it.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { WATER_ADDITION_STAGES, WATER_ADDITION_UNITS } from "@/lib/commands/production";
import { ionReadout, suggestAdditions, type SaltMaterial, type WaterAdditionFields, type WaterDraft, type WaterProfileIons } from "@/lib/mgr/recipe-process-view";
import type { Ions } from "@/lib/water-chemistry";
import { rowVerbs, type ListRowProps } from "./mash-schedule";

export type NamedOption = { id: string; name: string };

export function WaterView({ title = "Water", water, profiles, materials, sourceDefault, chemistryKnown = false, onChange, onAdd, ...verbs }: {
  title?: string; water: WaterDraft; profiles: WaterProfileIons[]; materials: SaltMaterial[]; sourceDefault?: Ions;
  /** The adapter's call: materials carry a salt identity (the fixture always; live once the schema has the field). Never inferred from a name. */
  chemistryKnown?: boolean;
  onChange?: (patch: Partial<WaterDraft>) => void; onAdd?: () => void;
} & ListRowProps) {
  const name = (list: NamedOption[], id: string) => list.find((x) => x.id === id)?.name ?? id;
  const target = profiles.find((p) => p.id === water.targetProfileId)?.ions;
  const source = water.sourceProfileId ? profiles.find((p) => p.id === water.sourceProfileId)?.ions : sourceDefault;
  const totalGal = (Number(water.mashGal) || 0) + (Number(water.spargeGal) || 0);
  // gated: no salt identity yet · waiting: nothing to compute against · ready: suggest and read out.
  const chemistry = !chemistryKnown ? "gated" : target && source && totalGal > 0 ? "ready" : "waiting";
  const readout = chemistry === "ready" ? ionReadout(water, source!, target!, materials) : [];
  return <>
    {E.back("Recipe", title)}
    {E.pick("Source profile", water.sourceProfileId, [{ value: "", label: "brewery default" }, ...(profiles.map((p) => ({ value: p.id, label: p.name })))], { onChange: onChange ? (nextValue: string) => onChange?.({ sourceProfileId: nextValue }) : undefined })}
    {E.pick("Target profile", water.targetProfileId, [{ value: "", label: "No target" }, ...(profiles.map((p) => ({ value: p.id, label: p.name })))], { onChange: onChange ? (nextValue: string) => onChange?.({ targetProfileId: nextValue }) : undefined })}
    {E.cols(
      E.edit("Mash water gal", water.mashGal, "number", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ mashGal: nextValue }) : undefined, min: "0", step: "any" }),
      E.edit("Sparge water gal", water.spargeGal, "number", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ spargeGal: nextValue }) : undefined, min: "0", step: "any" }),
    )}
    {E.edit("Target mash pH", water.targetMashPh, "number", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ targetMashPh: nextValue }) : undefined, min: "4", max: "7", step: "0.01" })}
    {E.ttl("Salts and acids")}
    {water.additions.map((a, i) => <div key={`${i}-${a.materialId}`}>{E.row(name(materials, a.materialId), `${a.qty} ${a.unit} · ${a.stage}`, rowVerbs(i, water.additions.length, verbs))}</div>)}
    {E.row("Add addition", "material · amount · stage", E.act("Add", "primary", undefined, onAdd))}
    {chemistry === "gated"
      ? E.gated("Suggest additions", "arrives with the material salt field")
      : E.btn("Suggest additions", chemistry === "ready" ? "g" : "g disabled", undefined, () => onChange?.({ additions: suggestAdditions(water, source!, target!, materials) }))}
    {chemistry === "ready" && <>
      {E.ttl("Against target")}
      {readout.map((r) => <div key={r.ion}>{E.row(r.ion, r.detail, "", r.warning ? "w" : "")}</div>)}
    </>}
    {chemistry === "gated" && target && source && E.gated("Ion read-out", "arrives with the material salt field")}
  </>;
}


export function WaterAdditionView({ fields, materials, onChange, footer }: { fields: WaterAdditionFields; materials: NamedOption[]; onChange?: (patch: Partial<WaterAdditionFields>) => void; footer?: ReactNode }) {
  return <>
    {E.pick("Material", fields.materialId, [{ value: "", label: "Salt or acid" }, ...(materials.map((m) => ({ value: m.id, label: m.name })))], { onChange: onChange ? (nextValue: string) => onChange?.({ materialId: nextValue }) : undefined, required: true })}
    {E.inline(
      E.edit("Amount", fields.qty, "number", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ qty: nextValue }) : undefined, required: true, min: "0", step: "any" }),
      E.pick("Unit", fields.unit, (WATER_ADDITION_UNITS.map(u => ({ value: u, label: u }))), { onChange: onChange ? (nextValue: string) => onChange?.({ unit: nextValue }) : undefined }),
    )}
    {E.pick("Stage", fields.stage, (WATER_ADDITION_STAGES.map(s => ({ value: s, label: s }))), { onChange: onChange ? (nextValue: string) => onChange?.({ stage: nextValue }) : undefined })}
    {footer !== undefined ? footer : E.btns([["Delete addition", "g"], "Save addition"])}
  </>;
}
