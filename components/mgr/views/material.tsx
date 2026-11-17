// components/mgr/views/material.tsx — shared Material sheet body. Sold by, beside
// the pack size, is the word one purchase unit is sold by (bag, box…); it offers
// None only until a word is saved, because a saved word cannot be cleared.
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { NONE } from "@/components/ui/select";
import { PACK_NAMES } from "@/lib/mgr/enums";
import type { MaterialViewModel } from "@/lib/mgr/material-view";
import { sentenceCase } from "@/lib/mgr/labels";
import type { ReactNode } from "react";
import { Fragment } from "react";

type Controls = Partial<Record<"name" | "kind" | "baseUnits" | "purchaseUnit" | "soldBy" | "unit" | "defaultVendorId" | "extractPotential" | "alphaAcid", (value: string) => void>> & {
  lotTracked?: (value: boolean) => void;
  active?: (value: boolean) => void;
};

const pick = (
  label: string,
  value: string,
  options: { value: string; label: string }[],
  change?: (value: string) => void,
  placeholder?: string,
) => (
  <Fragment key={label}>{E.pick(label, value, options, { onChange: change, placeholder })}</Fragment>
);

/** Kinds whose extract feeds the recipe OG/FG/ABV prediction (#430). */
/** Kinds whose extract potential feeds recipe gravity. */
export const EXTRACT_KINDS = new Set(["malt", "adjunct"]);
/** Kinds whose alpha acid feeds the recipe IBU estimate. */
export const ALPHA_KINDS = new Set(["hop"]);

const UNIT_LABELS: Record<string, string> = {
  lb: "Pounds (lb)",
  kg: "Kilograms (kg)",
  oz: "Ounces (oz)",
  g: "Grams (g)",
  each: "Each",
  l: "Liters (L)",
  gal: "Gallons (gal)",
  ml: "Milliliters (mL)",
};

export function MaterialView({ model, controls = {}, messages, footer }: {
  model: MaterialViewModel;
  controls?: Controls;
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  const kindOptions = model.kindOptions.map(value => ({ value, label: sentenceCase(value) }));
  const purchaseUnitOptions = model.purchaseUnitOptions.map(value => ({ value, label: UNIT_LABELS[value] ?? value }));
  const unitOptions = model.unitOptions.map(value => ({ value, label: UNIT_LABELS[value] ?? value }));
  const defaultVendorOptions = [
    { value: NONE, label: "None" },
    ...model.defaultVendorOptions.map(({ id, label }) => ({ value: id, label })),
  ];
  const changeDefaultVendor = controls.defaultVendorId
    ? (value: string) => controls.defaultVendorId?.(value === NONE ? "" : value)
    : undefined;
  const soldByOptions = [
    ...(model.soldBySaved ? [] : [{ value: NONE, label: "None" }]),
    ...PACK_NAMES.map(value => ({ value, label: sentenceCase(value) })),
  ];
  const changeSoldBy = controls.soldBy
    ? (value: string) => controls.soldBy?.(value === NONE ? "" : value)
    : undefined;

  return (
    <>
      {E.edit("Material name", model.name, "text", undefined, { onChange: controls.name, required: Boolean(controls.name) })}
      {pick("Kind", model.kind, kindOptions, controls.kind, "Select kind")}
      {E.inline(
        pick("Base unit", model.unit, unitOptions, controls.unit),
        pick("Purchase unit", model.purchaseUnit, purchaseUnitOptions, controls.purchaseUnit),
      )}
      {/* Side by side on the desk, stacked on a phone, where the long label would wrap beside a short one. */}
      {E.cols(
        E.edit("Base units per purchase unit", model.baseUnits, "number", undefined, { onChange: controls.baseUnits, min: 0, step: "any", inputMode: "decimal" }),
        E.pick("Sold by", model.soldBy || NONE, soldByOptions, {
          onChange: changeSoldBy,
          description: model.soldBy ? <FieldDescription>Once saved, this word can be changed but not cleared.</FieldDescription> : undefined,
        }),
      )}
      {E.info("Base unit is what recipes and counts use. Purchase unit is how you order it. For hops bought in 44 lb boxes, set Base unit to lb, Purchase unit to each, and Base units per purchase unit to 44. Sold by is the word for one purchase unit, so a recipe can read 23 bags.")}
      {EXTRACT_KINDS.has(model.kind.toLowerCase())
        ? E.edit("Extract potential · optional", model.extractPotential ?? "", "number", undefined, { onChange: controls.extractPotential, min: 1, max: 1.05, step: 0.001, inputMode: "decimal" })
        : null}
      {ALPHA_KINDS.has(model.kind.toLowerCase())
        ? E.edit("Alpha acid % · optional", model.alphaAcid ?? "", "number", undefined, { onChange: controls.alphaAcid, min: 0.01, max: 30, step: 0.01, inputMode: "decimal" })
        : null}
      {pick(
        "Default vendor · optional",
        model.defaultVendorId || NONE,
        defaultVendorOptions,
        changeDefaultVendor,
      )}
      {E.row(
        "Lot-tracked",
        "Receipts name a lot. Consumption picks one.",
        E.sw(model.lotTracked, "Lot-tracked", controls.lotTracked),
        "ok",
      )}
      {E.row(
        "Active",
        "This material is available to recipes and purchase orders.",
        E.sw(model.active, "Material active", controls.active),
        "ok",
      )}
      {messages}
      {footer !== undefined ? footer : E.btn("Save material")}
    </>
  );
}
