// components/mgr/views/water-profile.tsx — Water profile sheet: a name, six
// required, nonnegative ions in ppm, then optional alkalinity as CaCO3, water
// pH (0–14, the water's own, not mash pH) and notes (#1205). Inventory passes
// a fixture with no onChange; live wraps it in water-profile-form.tsx around
// upsert_water_profile.
"use client";
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { IONS, waterPpmError, waterPhError, waterProfileSaveReason, type WaterProfileFields } from "@/lib/mgr/water-profiles-view";
import { useTouchedLines } from "@/lib/mgr/touched-lines";
import type { ReactNode } from "react";
import { Fragment, useId, useState } from "react";

export function WaterProfileView({ fields, onChange, validationAttempted = false, messages, footer, submitting = false }: {
  fields: WaterProfileFields; onChange?: (patch: Partial<WaterProfileFields>) => void; validationAttempted?: boolean; messages?: ReactNode; footer?: ReactNode; submitting?: boolean;
}) {
  // One help line covers all six ions, so each ion input points at it; a
  // second covers the three optional fields the same way.
  const helpId = useId();
  const optionalHelpId = useId();
  const phId = useId();
  const [internalFields, setInternalFields] = useState(fields);
  const values = onChange ? fields : internalFields;
  const touched = useTouchedLines(!onChange || validationAttempted);
  const set = (key: keyof WaterProfileFields) => (nextValue: string) => {
    const patch = { [key]: nextValue };
    if (onChange) onChange(patch);
    else setInternalFields(previous => ({ ...previous, ...patch }));
  };
  const ion = ([key, label]: (typeof IONS)[number], index: number) => (
    <Fragment key={key}>{E.edit(`${label} (ppm)`, values[key], "number", undefined, { id: `${helpId}-${key}`, onChange: set(key), onBlur: () => touched.touch(index), error: touched.shown(index) ? waterPpmError(values[key]) : undefined, required: true, min: "0", max: "999999.9", step: "any", "aria-describedby": helpId })}</Fragment>
  );
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {E.edit("Profile name", values.name, "text", undefined, { onChange: set("name"), required: true })}
      <FieldDescription id={helpId}>All six ions are required. Enter 0 to 999,999.9 ppm (the same as mg/L). Values are stored rounded to one decimal place; for example, 12.345 becomes 12.3.</FieldDescription>
      {E.cols(ion(IONS[0], 0), ion(IONS[1], 1))}
      {E.cols(ion(IONS[2], 2), ion(IONS[3], 3))}
      {E.cols(ion(IONS[4], 4), ion(IONS[5], 5))}
      <FieldDescription id={optionalHelpId}>Alkalinity, water pH and notes are optional. Alkalinity accepts 0 to 999,999.9 ppm, stored rounded to one decimal place. Water pH is the water’s own pH, from 0 to 14, stored rounded to two decimal places, not a recipe’s target mash pH.</FieldDescription>
      {E.cols(
        E.edit("Alkalinity as CaCO3 (ppm)", values.alkalinity_ppm, "number", undefined, { id: `${optionalHelpId}-alkalinity`, onChange: set("alkalinity_ppm"), onBlur: () => touched.touch(IONS.length), error: touched.shown(IONS.length) ? waterPpmError(values.alkalinity_ppm, true) : undefined, min: "0", max: "999999.9", step: "any", "aria-describedby": optionalHelpId }),
        E.edit("Water pH", values.water_ph, "number", undefined, { id: phId, onChange: set("water_ph"), onBlur: () => touched.touch(IONS.length + 1), error: touched.shown(IONS.length + 1) ? waterPhError(values.water_ph) : undefined, min: "0", max: "14", step: "any", "aria-describedby": optionalHelpId }),
      )}
      {E.edit("Notes", values.note, "text", undefined, { id: `${optionalHelpId}-note`, onChange: set("note"), maxLength: 2000, "aria-describedby": [optionalHelpId, values.note.length >= 1800 ? `${optionalHelpId}-note-count` : undefined].filter(Boolean).join(" ") })}
      {values.note.length >= 1800 && <FieldDescription id={`${optionalHelpId}-note-count`}><output htmlFor={`${optionalHelpId}-note`}>{values.note.length} / 2000</output> characters</FieldDescription>}
    </fieldset>
    {messages}
    {footer !== undefined ? footer : E.submit("Save water profile", { reason: waterProfileSaveReason(values), submitting })}
  </>;
}
