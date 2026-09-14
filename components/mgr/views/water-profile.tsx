// components/mgr/views/water-profile.tsx — Water profile sheet: a name and six
// ions in ppm. Inventory passes a fixture with no onChange; live wraps it in
// water-profile-form.tsx around upsert_water_profile.
"use client";
import { E } from "@/components/mgr/e";
import { IONS, type WaterProfileFields } from "@/lib/mgr/water-profiles-view";
import type { ReactNode } from "react";
import { Fragment } from "react";

export function WaterProfileView({ fields, onChange, messages, footer, submitting = false }: {
  fields: WaterProfileFields; onChange?: (patch: Partial<WaterProfileFields>) => void; messages?: ReactNode; footer?: ReactNode; submitting?: boolean;
}) {
  // Inventory (no onChange) draws the fixture uncontrolled; live is controlled.
  const ion = ([key, label]: (typeof IONS)[number]) => (
    <Fragment key={key}>{E.edit(label + " ppm", fields[key], "number", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ [key]: nextValue }) : undefined, required: true, min: "0", step: "any", "aria-label": `${label} ppm` })}</Fragment>
  );
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      {E.edit("Profile name", fields.name, "text", undefined, { onChange: onChange ? (nextValue: string) => onChange?.({ name: nextValue }) : undefined, required: true })}
      {E.cols(ion(IONS[0]), ion(IONS[1]))}
      {E.cols(ion(IONS[2]), ion(IONS[3]))}
      {E.cols(ion(IONS[4]), ion(IONS[5]))}
    </fieldset>
    {messages}
    {footer !== undefined ? footer : E.btn("Save profile")}
  </>;
}
