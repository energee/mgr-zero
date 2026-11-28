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
// Under the two assumptions the sheet may offer the number the brewery's own
// batches measured (docs/plans/derived-assumptions.md): a sentence and a Use
// button, which fills the field like typing it. Nothing is changed for the brewer.
"use client";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import type { AssumptionOffer } from "@/lib/mgr/recipe-assumptions";
import { BATCH_BBL_BOUNDS, RECIPE_NUMBERS, type RecipeNumberKey } from "@/lib/mgr/recipe-view";

/** A field of the sheet: the batch size, or one of the eight process numbers. */
export type RecipeNumberField = RecipeNumberKey | "batchBbl";

export function RecipeNumbersView({ values, onChange, suggestions = {} }: {
  values: Partial<Record<RecipeNumberField, string>>;
  onChange?: (field: RecipeNumberField, value: string) => void;
  /** What the brewery's batches measured, for the assumptions whose field holds another number. */
  suggestions?: Partial<Record<RecipeNumberKey, AssumptionOffer>>;
}) {
  const field = (key: RecipeNumberField, label: string, bounds: { min?: number; max?: number; step?: number }) =>
    E.edit(label, values[key] ?? "", "number", undefined, { compact: true, ...bounds, ...(onChange && { onChange: (value: string) => onChange(key, value) }) });
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      {/* The batch size heads the sheet on a row of its own; the eight numbers pair up under it. */}
      <div className="col-span-2">{field("batchBbl", "Batch size bbl", BATCH_BBL_BOUNDS)}</div>
      {RECIPE_NUMBERS.map(([key, label, bounds]) => {
        const offer = suggestions[key];
        // The offer sits in the field's own cell, so a field never moves when its offer comes or goes.
        return (
          <div key={key}>
            {field(key, label, bounds)}
            {offer ? (
              <div className="mt-1 text-muted-foreground text-xs">
                <p>{offer.text}</p>
                <Button type="button" variant="ghost" size="sm" className="-ml-2 h-7 text-primary" aria-label={`Use ${offer.use}% for ${label}`}
                  onClick={onChange && (() => onChange(key, offer.use))}>Use {offer.use}%</Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
