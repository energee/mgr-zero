// components/mgr/views/water-profile.tsx — Water profile sheet: a name and six
// ions in ppm. Inventory passes a fixture with no onChange; live wraps it in
// water-profile-form.tsx around upsert_water_profile.
"use client";
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { IONS, type WaterProfileFields } from "@/lib/mgr/water-profiles-view";

export function WaterProfileView({ fields, onChange, messages, footer, submitting = false }: {
  fields: WaterProfileFields; onChange?: (patch: Partial<WaterProfileFields>) => void; messages?: ReactNode; footer?: ReactNode; submitting?: boolean;
}) {
  // Inventory (no onChange) draws the fixture uncontrolled; live is controlled.
  const bind = (key: keyof WaterProfileFields) => onChange ? { value: fields[key] } : { defaultValue: fields[key] };
  const ion = ([key, label]: (typeof IONS)[number]) => (
    <Field key={key}><FieldLabel>{label} ppm</FieldLabel><Input aria-label={`${label} ppm`} type="number" min="0" step="any" required {...bind(key)} onChange={(e) => onChange?.({ [key]: e.target.value })} /></Field>
  );
  return <>
    <fieldset disabled={submitting} className="flex flex-col gap-3">
      <Field><FieldLabel>Profile name</FieldLabel><Input aria-label="Profile name" required {...bind("name")} onChange={(e) => onChange?.({ name: e.target.value })} /></Field>
      {E.cols(ion(IONS[0]), ion(IONS[1]))}
      {E.cols(ion(IONS[2]), ion(IONS[3]))}
      {E.cols(ion(IONS[4]), ion(IONS[5]))}
    </fieldset>
    {messages}
    {footer !== undefined ? footer : E.btn("Save profile")}
  </>;
}
