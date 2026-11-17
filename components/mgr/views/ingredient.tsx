// components/mgr/views/ingredient.tsx — Ingredient (one line of a recipe
// version): the material, the stage it enters at, its quantity per barrel in
// the material's own unit (a line never invents one), and an optional timing.
// When the recipe has a batch size and the picked material a pack size, a
// count of packs sits above the per-barrel quantity ("Bags (55 lb) for 22
// bbl"): typing it works the per-barrel amount out, and typing the
// per-barrel amount moves the count, so the two stay in step. Only the
// per-barrel amount is kept.
// Inventory draws a fixture with no onChange; the live sheet
// (recipes/[id]/schedule-sheets.tsx) edits a draft version. Material and
// stage are picked by id and enum value; the labels are display. Material is
// a searchable picker (E.searchPick), since a brewery's material list outgrows
// a Select; an option reads "name · category" when the category is known. With
// no materials it opens Materials in a new tab, keeping both drafts mounted.
// Recipe editors (Admin, Brewer) may add materials there (#1123, #1384).
"use client";
import { useId, useState, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormFooter } from "@/components/mgr/command-form";
import { sentenceCase } from "@/lib/mgr/labels";
import { noMaterialsPick } from "@/lib/mgr/materials-view";
import { hasPack } from "@/lib/mgr/pack-qty";
import type { PackName } from "@/lib/mgr/enums";
import { ingredientReason, INGREDIENT_STAGES, packsFieldText, packsLabel, packsToPerBbl, timedInDays, type IngredientFields, type TimingLimits } from "@/lib/mgr/recipe-process-view";

export type { IngredientFields };
/** `unit` is the material's base unit as the command returns it; absent until a material is picked.
 *  `category` (hop, malt…) is shown beside the name when present. `packSize` is base units per purchase pack
 *  (absent or 1: no pack size) and `packName` the word that pack is sold by. */
export type IngredientMaterial = { id: string; name: string; unit?: string; category?: string; packSize?: number; packName?: PackName | null };
/** The Stage pick's options, here and on Brew day: the stored value, shown in sentence case ("dry_hop" reads "Dry hop"). */
export const INGREDIENT_STAGE_OPTIONS = INGREDIENT_STAGES.map((s) => ({ value: s, label: sentenceCase(s) }));

/** No boil time and no schedule: the one-day and 120-day ceilings. */
const DEFAULT_LIMITS: TimingLimits = { fermentationDays: 0 };

export function IngredientView({ fields, materials, limits = DEFAULT_LIMITS, batchBbl, onChange, onSave, onDelete, footer }: {
  fields: IngredientFields; materials: IngredientMaterial[];
  /** The draft's boil time and fermentation schedule length, which bound the timing (#1478). */
  limits?: TimingLimits;
  /** The recipe's batch size in bbl; absent or 0 means it has none, and the line is typed per barrel only. */
  batchBbl?: number;
  onChange?: (patch: Partial<IngredientFields>) => void; onSave?: () => void; onDelete?: (() => void) | null; footer?: ReactNode;
}) {
  const bind = (key: keyof IngredientFields) => onChange && { onChange: (value: string) => onChange({ [key]: value } as Partial<IngredientFields>) };
  const id = useId();
  const material = materials.find((m) => m.id === fields.materialId);
  const unit = material?.unit;
  const qtyLabel = unit ? `Quantity per bbl (${unit})` : "Quantity per bbl";
  // A line can be typed in packs once the recipe has a batch size and the material a pack (hasPack).
  const pack = material?.unit && material.packSize !== undefined ? { factor: material.packSize, unit: material.unit, packName: material.packName ?? null } : undefined;
  const packs = batchBbl && pack && hasPack(pack) ? { ...pack, batchBbl } : undefined;
  // The count as last typed; packsFieldText shows it only while the per-barrel amount is still the one it gave.
  const [typedPacks, setTypedPacks] = useState("");
  return <>
    {E.searchPick("Material", fields.materialId, materials.map((m) => ({ value: m.id, label: m.category ? `${m.name} · ${m.category}` : m.name })), { id: `${id}-material`, placeholder: "Choose a material", empty: onChange ? { ...noMaterialsPick("/materials"), label: "Add a material (opens in a new tab)", target: "_blank" } : noMaterialsPick(), ...bind("materialId") })}
    {E.pick("Stage", fields.stage, INGREDIENT_STAGE_OPTIONS, bind("stage"))}
    {packs ? E.edit(packsLabel(packs), packsFieldText(fields.perBblQty, typedPacks, packs), "number", undefined, {
      id: `${id}-packs`, min: 0,
      ...(onChange && { onChange: (value: string) => { setTypedPacks(value); onChange({ perBblQty: packsToPerBbl(value, packs) }); } }),
    }) : null}
    {E.inline(
      E.edit(qtyLabel, fields.perBblQty, "number", undefined, { id: `${id}-qty`, ...bind("perBblQty") }),
      // Fermentation and dry hop count days from the start of fermentation; other stages count minutes.
      E.edit(timedInDays(fields.stage) ? "Timing day · optional" : "Timing min · optional", fields.timing, "number", undefined, bind("timing")),
    )}
    {footer !== undefined ? footer : <CommandFormFooter>
      {onDelete !== null && <Button type="button" variant="outline" onClick={onDelete}>Delete ingredient</Button>}
      {E.submit("Save ingredient", { type: "button", reason: ingredientReason(fields, limits), onClick: onSave })}
    </CommandFormFooter>}
  </>;
}
