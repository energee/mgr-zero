// components/mgr/views/water-profile.tsx — Water profile sheet: a name, six
// required, nonnegative ions in ppm, then optional alkalinity as CaCO3, water
// pH (0–14, the water's own, not mash pH) and notes (#1205). Inventory passes
// a fixture with no onChange; live wraps it in water-profile-form.tsx around
// upsert_water_profile.
"use client";
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { IONS, waterProfileSaveReason, type WaterProfileFields } from "@/lib/mgr/water-profiles-view";
import type { ReactNode } from "react";
import { Fragment, useId } from "react";

export function WaterProfileView({ fields, onChange, messages, footer, submitting = false }: {
  fields: WaterProfileFields; onChange?: (patch: Partial<WaterProfileFields>) => void; messages?: ReactNode; footer?: ReactNode; submitting?: boolean;
}) {
  // One help line covers all six ions, so each ion input points at it; a
  // second covers the three optional fields the same way.
  const helpId = useId();
  const optionalHelpId = useId();
  // Inventory (no onChange) draws the fixture uncontrolled; live is controlled.
  const set = (key: keyof WaterProfileFields) => (onChange ? (nextValue: string) => onChange({ [key]: nextValue }) : undefined);
  const ion = ([key, label]: (typeof IONS)[number]) => (
    <Fragment key={key}>{E.edit(`${label} (ppm)`, fields[key], "number", undefined, { onChange: set(key), required: true, min: "0", step: "any", "aria-describedby": helpId })}</Fragment>
  );
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {E.edit("Profile name", fields.name, "text", undefined, { onChange: set("name"), required: true })}
      <FieldDescription id={helpId}>All six ions are required. Enter each in ppm (the same as mg/L). None can be negative.</FieldDescription>
      {E.cols(ion(IONS[0]), ion(IONS[1]))}
      {E.cols(ion(IONS[2]), ion(IONS[3]))}
      {E.cols(ion(IONS[4]), ion(IONS[5]))}
      <FieldDescription id={optionalHelpId}>Alkalinity, water pH and notes are optional. Water pH is the water’s own pH, from 0 to 14, not a recipe’s target mash pH.</FieldDescription>
      {E.cols(
        E.edit("Alkalinity as CaCO3 (ppm)", fields.alkalinity_ppm, "number", undefined, { onChange: set("alkalinity_ppm"), min: "0", step: "any", "aria-describedby": optionalHelpId }),
        E.edit("Water pH", fields.water_ph, "number", undefined, { onChange: set("water_ph"), min: "0", max: "14", step: "any", "aria-describedby": optionalHelpId }),
      )}
      {E.edit("Notes", fields.note, "text", undefined, { onChange: set("note"), maxLength: 2000, "aria-describedby": optionalHelpId })}
    </fieldset>
    {messages}
    {footer !== undefined ? footer : E.submit("Save water profile", { reason: waterProfileSaveReason(fields), submitting })}
  </>;
}
