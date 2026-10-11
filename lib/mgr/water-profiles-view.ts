// lib/mgr/water-profiles-view.ts — view-models for Water profiles (the list)
// and Water profile (the sheet): a name and six ions in ppm, as
// list_water_profiles returns them and upsert_water_profile takes them.
import type { EmptyState } from "./empty-state";
import { IONS as CHEMISTRY_IONS, ION_LABELS, type Ions } from "@/lib/water-chemistry";

export type Ion = `${keyof Ions}_ppm`;

/** Column name, label, and the upsert_water_profile input key, one row per ion.
 *  Derived from lib/water-chemistry's IONS: add a seventh ion there, not here. */
export const IONS = CHEMISTRY_IONS.map((ion) => [`${ion}_ppm`, ION_LABELS[ion], `${ion}Ppm`] as const);
export type WaterProfile = { id: string; name: string } & Record<Ion, number>;

export type WaterProfilesViewModel = {
  backLabel?: string;
  backHref?: string;
  rows: { key: string; title: string; detail: string }[];
  empty?: EmptyState;
};
/** The sheet's fields as typed: strings, so a half-typed "1." survives a render. */
export type WaterProfileFields = { name: string } & Record<Ion, string>;

export const ionLine = (p: Record<Ion, number>) => IONS.map(([key, label]) => `${label} ${p[key]}`).join(" · ");

/** Where the page's back arrow goes. Brewer cannot open Catalog (list_price_groups
 *  excludes brewer), so Brewer, who arrives from a recipe's Water sheet, goes back to Recipes. */
export function waterProfilesBack(role: string): { label: string; href: string } {
  return role === "brewer" ? { label: "Recipes", href: "/recipes" } : { label: "Catalog", href: "/catalog" };
}

export function toWaterProfilesViewProps(s: { profiles: WaterProfile[]; back?: { label: string; href: string } }): WaterProfilesViewModel {
  return {
    backLabel: s.back?.label,
    backHref: s.back?.href,
    rows: s.profiles.map((p) => ({ key: p.id, title: p.name, detail: ionLine(p) })),
    empty: s.profiles.length ? undefined : { title: "No water profiles yet", description: "Add profile records your source water or a target." },
  };
}

export function toWaterProfileFields(p?: WaterProfile): WaterProfileFields {
  const fields: WaterProfileFields = { name: p?.name ?? "", calcium_ppm: "", magnesium_ppm: "", sodium_ppm: "", sulfate_ppm: "", chloride_ppm: "", bicarbonate_ppm: "" };
  if (p) for (const [key] of IONS) fields[key] = String(p[key]);
  return fields;
}
