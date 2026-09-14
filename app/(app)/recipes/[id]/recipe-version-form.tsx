// app/(app)/recipes/[id]/recipe-version-form.tsx — CommandForm for
// create_recipe_version: the process spec (mash and fermentation schedules
// and water, each on its own draft sheet in schedule-sheets.tsx; pre-boil,
// whirlpool and knockout inline), the assumption scalars (brewhouse
// efficiency, yeast attenuation, optional boil/IBU) and ingredient lines
// (material, per-bbl quantity, stage, optional timing). The OG/FG/ABV
// preview below the ingredient table calls the same pure recipeGravity the
// server uses (lib/recipe-gravity.ts) — never a second formula — and prints
// its Plato result in the reader's chosen unit (`unit`, from get_gravity_unit).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { recipeGravity } from "@/lib/recipe-gravity";
import { EMPTY_WATER, type FermentationStage, type MashStep, type WaterDraft } from "@/lib/mgr/recipe-process-view";
import { FermentationScheduleSheet, MashScheduleSheet, WaterSheet } from "./schedule-sheets";
import type { NamedOption } from "@/components/mgr/views/water";

const STAGES = ["mash", "boil", "whirlpool", "fermentation", "dry_hop", "packaging", "other"] as const;

type Material = { id: string; name: string; category: string; extract_potential: number | null };
type Line = { materialId: string; perBblQty: string; stage: (typeof STAGES)[number]; timingMinutes: string };

const emptyLine = (): Line => ({ materialId: "", perBblQty: "", stage: "mash", timingMinutes: "" });

const DEFAULT_MASH: MashStep[] = [{ name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 }];
const EMPTY_PROCESS = { preBoilBbl: "", whirlpoolMinutes: "", whirlpoolTempF: "", whirlpoolRestMinutes: "", knockoutTempF: "" };
const num = (v: string) => (v === "" ? undefined : Number(v));

export function NewVersionForm({ recipeId, recipeName, materials, profiles, unit }: { recipeId: string; recipeName: string; materials: Material[]; profiles: NamedOption[]; unit: GravityUnit }) {
  const [mashSchedule, setMashSchedule] = useState<MashStep[]>(DEFAULT_MASH);
  const [fermentationSchedule, setFermentationSchedule] = useState<FermentationStage[]>([]);
  const [process, setProcess] = useState(EMPTY_PROCESS);
  const [water, setWater] = useState<WaterDraft>(EMPTY_WATER);
  const [brewhouseEfficiency, setBrewhouseEfficiency] = useState("0.75");
  const [yeastAttenuation, setYeastAttenuation] = useState("0.78");
  const [boilMinutes, setBoilMinutes] = useState("");
  const [targetIbu, setTargetIbu] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const validLines = lines.filter((l) => l.materialId && Number(l.perBblQty) > 0);
  const form = useCommandForm("create_recipe_version", {
    build: () => ({
      recipeId, mashSchedule, fermentationSchedule,
      process: { preBoilBbl: num(process.preBoilBbl), whirlpoolMinutes: num(process.whirlpoolMinutes), whirlpoolTempF: num(process.whirlpoolTempF), whirlpoolRestMinutes: num(process.whirlpoolRestMinutes), knockoutTempF: num(process.knockoutTempF) },
      water: { targetProfileId: water.targetProfileId || undefined, sourceProfileId: water.sourceProfileId || undefined, mashGal: num(water.mashGal), spargeGal: num(water.spargeGal), targetMashPh: num(water.targetMashPh), additions: water.additions },
      brewhouseEfficiency: Number(brewhouseEfficiency), yeastAttenuation: Number(yeastAttenuation),
      boilMinutes: boilMinutes ? Number(boilMinutes) : undefined, targetIbu: targetIbu ? Number(targetIbu) : undefined, note: note || undefined,
      ingredients: validLines.map((l) => ({
        materialId: l.materialId, perBblQty: Number(l.perBblQty), stage: l.stage,
        timingMinutes: l.timingMinutes ? Number(l.timingMinutes) : undefined,
      })),
    }),
    reset: () => {
      setMashSchedule(DEFAULT_MASH); setFermentationSchedule([]); setProcess(EMPTY_PROCESS); setWater(EMPTY_WATER); setBrewhouseEfficiency("0.75"); setYeastAttenuation("0.78");
      setBoilMinutes(""); setTargetIbu(""); setNote(""); setLines([emptyLine()]);
    },
  });

  // Recomputed every render: the inputs are a handful of numbers, and a memo
  // keyed on the fresh `validLines` array would never hit anyway.
  const preview = (() => {
    const eff = Number(brewhouseEfficiency), att = Number(yeastAttenuation);
    if (!(eff > 0 && eff <= 1) || !(att > 0 && att <= 1) || validLines.length === 0) return null;
    return recipeGravity({
      brewhouseEfficiency: eff, yeastAttenuation: att,
      ingredients: validLines.map((l) => {
        const m = materials.find((mm) => mm.id === l.materialId);
        // A material with no extract_potential contributes nothing rather than
        // a made-up default; recipeGravity skips it (lib/recipe-gravity.ts).
        return { perBblQty: Number(l.perBblQty), extractPotential: m?.extract_potential ?? null, stage: l.stage };
      }),
    });
  })();

  const setLine = (i: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const ready = mashSchedule.length > 0 && brewhouseEfficiency && yeastAttenuation && validLines.length > 0;
  const setP = (key: keyof typeof EMPTY_PROCESS) => (e: React.ChangeEvent<HTMLInputElement>) => setProcess((p) => ({ ...p, [key]: e.target.value }));

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New version" trigger={<Button size="sm">New version</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <MashScheduleSheet title={`${recipeName} · Mash schedule`} steps={mashSchedule} onChange={setMashSchedule} />
          <FermentationScheduleSheet title={`${recipeName} · Fermentation`} stages={fermentationSchedule} onChange={setFermentationSchedule} />
          <WaterSheet title={`${recipeName} · Water`} water={water} profiles={profiles} materials={materials} onChange={setWater} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-preboil">Pre-boil volume (bbl) · optional</Label>
            <Input id="rv-preboil" type="number" min="0" step="any" value={process.preBoilBbl} onChange={setP("preBoilBbl")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-boil">Boil minutes · optional</Label>
            <Input id="rv-boil" type="number" min="0" step="1" value={boilMinutes} onChange={(e) => setBoilMinutes(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-eff">Brewhouse efficiency (0–1]</Label>
            <Input id="rv-eff" type="number" min="0" max="1" step="0.01" value={brewhouseEfficiency} onChange={(e) => setBrewhouseEfficiency(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-att">Yeast attenuation (0–1]</Label>
            <Input id="rv-att" type="number" min="0" max="1" step="0.01" value={yeastAttenuation} onChange={(e) => setYeastAttenuation(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-ibu">Target IBU · optional</Label>
            <Input id="rv-ibu" type="number" min="0" step="any" value={targetIbu} onChange={(e) => setTargetIbu(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-wp-min">Whirlpool min · optional</Label>
            <Input id="rv-wp-min" type="number" min="0" step="1" value={process.whirlpoolMinutes} onChange={setP("whirlpoolMinutes")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-wp-temp">Whirlpool temp °F · optional</Label>
            <Input id="rv-wp-temp" type="number" step="any" value={process.whirlpoolTempF} onChange={setP("whirlpoolTempF")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-wp-rest">Whirlpool rest min · optional</Label>
            <Input id="rv-wp-rest" type="number" min="0" step="1" value={process.whirlpoolRestMinutes} onChange={setP("whirlpoolRestMinutes")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-ko">Knockout temp °F · optional</Label>
            <Input id="rv-ko" type="number" step="any" value={process.knockoutTempF} onChange={setP("knockoutTempF")} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Ingredients</Label>
          {lines.map((l, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <Select value={l.materialId} onValueChange={(v) => setLine(i, { materialId: v })}>
                <SelectTrigger aria-label={`Line ${i + 1} material`} className="min-w-40 flex-1"><SelectValue placeholder="Material" /></SelectTrigger>
                <SelectContent>{materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={l.stage} onValueChange={(v) => setLine(i, { stage: v as Line["stage"] })}>
                <SelectTrigger aria-label={`Line ${i + 1} stage`} className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
              <Input aria-label={`Line ${i + 1} per bbl`} type="number" min="0" step="any" className="w-24" placeholder="per bbl" value={l.perBblQty} onChange={(e) => setLine(i, { perBblQty: e.target.value })} />
              <Input aria-label={`Line ${i + 1} timing minutes`} type="number" min="0" step="1" className="w-24" placeholder="min · optional" value={l.timingMinutes} onChange={(e) => setLine(i, { timingMinutes: e.target.value })} />
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setLines((prev) => [...prev, emptyLine()])}>Add ingredient</Button>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rv-note">Note · optional</Label>
          <Input id="rv-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {preview ? (
          <p className="text-sm text-muted-foreground" role="status">
            Predicted: {formatGravity(preview.ogPlato, unit)} OG · {formatGravity(preview.fgPlato, unit)} FG · {preview.abv.toFixed(1)}% ABV
          </p>
        ) : null}
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Save version"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
