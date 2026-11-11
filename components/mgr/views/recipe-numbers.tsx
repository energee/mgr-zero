// components/mgr/views/recipe-numbers.tsx — Recipe numbers: the one sheet
// that holds the recipe's batch size and its eight process numbers (the two
// assumptions, the pre-boil volume, the boil time, the whirlpool's minutes,
// rest and temperature, and the knock-out temperature). The recipe page reads
// them as text. One read in a sentence opens this sheet. The boil time and the
// two whirlpool times are written on the band, which is not tappable; Edit
// recipe numbers under the band opens the sheet for them.
// Each is a small field under its label. The inventory draws a fixture with no
// onChange; the live sheet (recipes/[id]/schedule-sheets.tsx) edits the
// recipe's unsaved sheet as each field is typed, so there is no Save here.
"use client";
import { E } from "@/components/mgr/e";
import { BATCH_BBL_BOUNDS, RECIPE_NUMBERS, type RecipeNumberKey } from "@/lib/mgr/recipe-view";

/** A field of the sheet: the batch size, or one of the eight process numbers. */
export type RecipeNumberField = RecipeNumberKey | "batchBbl";

export function RecipeNumbersView({ values, onChange }: {
  values: Partial<Record<RecipeNumberField, string>>;
  onChange?: (field: RecipeNumberField, value: string) => void;
}) {
  const field = (key: RecipeNumberField, label: string, bounds: { min?: number; max?: number; step?: number }) =>
    E.edit(label, values[key] ?? "", "number", undefined, { compact: true, ...bounds, ...(onChange && { onChange: (value: string) => onChange(key, value) }) });
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {/* The batch size heads the sheet on a row of its own; the eight numbers pair up under it. */}
      <div className="col-span-2">{field("batchBbl", "Batch size bbl", BATCH_BBL_BOUNDS)}</div>
      {RECIPE_NUMBERS.map(([key, label, bounds]) => <div key={key}>{field(key, label, bounds)}</div>)}
    </div>
  );
}
