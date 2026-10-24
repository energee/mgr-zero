// lib/mgr/water-profiles-view.ts — view-models for Water profiles (the list)
// and Water profile (the sheet): a name, six ions in ppm, and optional
// alkalinity as CaCO3, water pH and notes (#1205), as list_water_profiles
// returns them and upsert_water_profile takes them. A
// profile is not marked as a source or a target: a recipe version can pick its
// source and its target from this one list.
import type { EmptyState } from "./empty-state";
import { IONS as CHEMISTRY_IONS, ION_LABELS, type Ions } from "@/lib/water-chemistry";
import { optionalNumber } from "./recipe-process-view";
import { hasAnyRole } from "./roles";
import { submitReason } from "./submit-reason";

export type Ion = `${keyof Ions}_ppm`;

/** Column name, label, and the upsert_water_profile input key, one row per ion.
 *  Derived from lib/water-chemistry's IONS: add a seventh ion there, not here. */
export const IONS = CHEMISTRY_IONS.map((ion) => [`${ion}_ppm`, ION_LABELS[ion], `${ion}Ppm`] as const);
/** water_ph is the water's own pH, not a recipe's target mash pH. */
export type WaterProfile = { id: string; name: string; alkalinity_ppm: number | null; water_ph: number | null; note: string | null } & Record<Ion, number>;

export type WaterProfilesViewModel = {
  backLabel?: string;
  backHref?: string;
  rows: { key: string; title: string; detail: string }[];
  empty?: EmptyState;
};
/** The sheet's fields as typed: strings, so a half-typed "1." survives a render. */
export type WaterProfileFields = { name: string; alkalinity_ppm: string; water_ph: string; note: string } & Record<Ion, string>;

export const ionLine = (p: Record<Ion, number>) => IONS.map(([key, label]) => `${label} ${p[key]}`).join(" · ");

/** A list row: the ions, then alkalinity and water pH when the profile has them. */
function profileLine(p: WaterProfile): string {
  const parts = [ionLine(p)];
  if (p.alkalinity_ppm !== null) parts.push(`Alkalinity ${p.alkalinity_ppm}`);
  if (p.water_ph !== null) parts.push(`Water pH ${p.water_ph}`);
  return parts.join(" · ");
}

/** Preserve the Settings entry for Admin; otherwise use a role-accessible default. */
export function waterProfilesBack(roles: readonly string[], from?: string | string[]): { label: string; href: string } {
  if (from === "settings" && roles.includes("admin")) return { label: "Settings", href: "/settings" };
  return hasAnyRole(roles, ["admin", "sales", "warehouse"]) ? { label: "Catalog", href: "/catalog" } : { label: "Recipes", href: "/recipes" };
}

export function toWaterProfilesViewProps(s: { profiles: WaterProfile[]; back?: { label: string; href: string } }): WaterProfilesViewModel {
  return {
    backLabel: s.back?.label,
    backHref: s.back?.href,
    rows: s.profiles.map((p) => ({ key: p.id, title: p.name, detail: profileLine(p) })),
    empty: s.profiles.length ? undefined : { title: "No water profiles yet", description: "Add a water profile with its mineral measurements. Profiles are not classified as source or target here; choose either role on a recipe’s Water sheet." },
  };
}

export function toWaterProfileFields(p?: WaterProfile): WaterProfileFields {
  const fields: WaterProfileFields = {
    name: p?.name ?? "", calcium_ppm: "", magnesium_ppm: "", sodium_ppm: "", sulfate_ppm: "", chloride_ppm: "", bicarbonate_ppm: "",
    alkalinity_ppm: String(p?.alkalinity_ppm ?? ""), water_ph: String(p?.water_ph ?? ""), note: p?.note ?? "",
  };
  if (p) for (const [key] of IONS) fields[key] = String(p[key]);
  return fields;
}

/** The existing Save requirements, expressed as an actionable adjacent hint. */
export function waterProfileSaveReason(fields: WaterProfileFields): string | null {
  const missing: string[] = [];
  if (!fields.name.trim()) missing.push("a profile name");
  if (!IONS.every(([key]) => fields[key] !== "" && Number(fields[key]) >= 0)) missing.push("all six ions in ppm, zero or more");
  if (fields.alkalinity_ppm !== "" && !(Number(fields.alkalinity_ppm) >= 0)) missing.push("alkalinity as CaCO3 of zero or more");
  const ph = Number(fields.water_ph);
  if (fields.water_ph !== "" && !(ph >= 0 && ph <= 14)) missing.push("water pH from 0 to 14");
  return submitReason(missing);
}

/** The sheet's fields as upsert_water_profile input (without profileId). A
 *  blank alkalinity or pH is left out, so the profile stores none. */
export function toWaterProfileInput(f: WaterProfileFields) {
  return {
    name: f.name,
    ...Object.fromEntries(IONS.map(([key, , input]) => [input, Number(f[key])])),
    alkalinityPpm: optionalNumber(f.alkalinity_ppm), waterPh: optionalNumber(f.water_ph), note: f.note,
  };
}
