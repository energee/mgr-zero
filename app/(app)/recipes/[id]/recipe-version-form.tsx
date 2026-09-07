// app/(app)/recipes/[id]/recipe-version-form.tsx — CommandForm for
// create_recipe_version: the assumption scalars (mash temp, brewhouse
// efficiency, yeast attenuation, optional boil/IBU) and ingredient lines
// (material, per-bbl quantity, stage, optional timing). The OG/FG/ABV
// preview below the ingredient table calls the same pure recipeGravity the
// server uses (lib/recipe-gravity.ts) — never a second formula — and prints
// its Plato result in the reader's chosen unit (`unit`, from get_gravity_unit).
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { formatGravity, type GravityUnit } from "@/lib/mgr/gravity-unit";
import { recipeGravity } from "@/lib/recipe-gravity";

const STAGES = ["mash", "boil", "whirlpool", "fermentation", "dry_hop", "packaging", "other"] as const;

type Material = { id: string; name: string; category: string; extract_potential: number | null };
type Line = { materialId: string; perBblQty: string; stage: (typeof STAGES)[number]; timingMinutes: string };

const emptyLine = (): Line => ({ materialId: "", perBblQty: "", stage: "mash", timingMinutes: "" });

export function NewVersionForm({ recipeId, materials, unit }: { recipeId: string; materials: Material[]; unit: GravityUnit }) {
  const [mashTempF, setMashTempF] = useState("152");
  const [brewhouseEfficiency, setBrewhouseEfficiency] = useState("0.75");
  const [yeastAttenuation, setYeastAttenuation] = useState("0.78");
  const [boilMinutes, setBoilMinutes] = useState("");
  const [targetIbu, setTargetIbu] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const validLines = lines.filter((l) => l.materialId && Number(l.perBblQty) > 0);
  const form = useCommandForm("create_recipe_version", {
    build: () => ({
      recipeId, mashTempF: Number(mashTempF), brewhouseEfficiency: Number(brewhouseEfficiency), yeastAttenuation: Number(yeastAttenuation),
      boilMinutes: boilMinutes ? Number(boilMinutes) : undefined, targetIbu: targetIbu ? Number(targetIbu) : undefined, note: note || undefined,
      ingredients: validLines.map((l) => ({
        materialId: l.materialId, perBblQty: Number(l.perBblQty), stage: l.stage,
        timingMinutes: l.timingMinutes ? Number(l.timingMinutes) : undefined,
      })),
    }),
    reset: () => {
      setMashTempF("152"); setBrewhouseEfficiency("0.75"); setYeastAttenuation("0.78");
      setBoilMinutes(""); setTargetIbu(""); setNote(""); setLines([emptyLine()]);
    },
  });

  const preview = useMemo(() => {
    const eff = Number(brewhouseEfficiency), att = Number(yeastAttenuation), temp = Number(mashTempF);
    if (!(eff > 0 && eff <= 1) || !(att > 0 && att <= 1) || validLines.length === 0) return null;
    return recipeGravity({
      mashTempF: temp, brewhouseEfficiency: eff, yeastAttenuation: att,
      ingredients: validLines.map((l) => {
        const m = materials.find((mm) => mm.id === l.materialId);
        // A material with no extract_potential contributes nothing rather than
        // a made-up default; recipeGravity skips it (lib/recipe-gravity.ts).
        return { perBblQty: Number(l.perBblQty), extractPotential: m?.extract_potential ?? null, stage: l.stage };
      }),
    });
  }, [mashTempF, brewhouseEfficiency, yeastAttenuation, validLines, materials]);

  const setLine = (i: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const ready = mashTempF && brewhouseEfficiency && yeastAttenuation && validLines.length > 0;

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New version" trigger={<Button size="sm">New version</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rv-mash">Mash temp (°F)</Label>
            <Input id="rv-mash" type="number" value={mashTempF} onChange={(e) => setMashTempF(e.target.value)} required />
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
