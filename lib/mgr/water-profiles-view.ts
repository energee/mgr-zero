// lib/mgr/water-profiles-view.ts — view-models for Water profiles (the list)
// and Water profile (the sheet): a name and six ions in ppm, as
// list_water_profiles returns them and upsert_water_profile takes them.
import type { EmptyState } from "./empty-state";

export const IONS = [
  ["calcium_ppm", "Calcium"], ["magnesium_ppm", "Magnesium"], ["sodium_ppm", "Sodium"],
  ["sulfate_ppm", "Sulfate"], ["chloride_ppm", "Chloride"], ["bicarbonate_ppm", "Bicarbonate"],
] as const;
export type Ion = (typeof IONS)[number][0];
export type WaterProfile = { id: string; name: string } & Record<Ion, number>;

export type WaterProfilesViewModel = {
  backHref?: string;
  rows: { key: string; title: string; detail: string }[];
  empty?: EmptyState;
};
/** The sheet's fields as typed: strings, so a half-typed "1." survives a render. */
export type WaterProfileFields = { name: string } & Record<Ion, string>;

export const ionLine = (p: Record<Ion, number>) => IONS.map(([key, label]) => `${label} ${p[key]}`).join(" · ");

export function toWaterProfilesViewProps(s: { profiles: WaterProfile[]; backHref?: string }): WaterProfilesViewModel {
  return {
    backHref: s.backHref,
    rows: s.profiles.map((p) => ({ key: p.id, title: p.name, detail: ionLine(p) })),
    empty: s.profiles.length ? undefined : { title: "No water profiles yet", description: "Add profile records your source water or a target." },
  };
}

export const toWaterProfileFields = (p?: WaterProfile): WaterProfileFields =>
  ({ name: p?.name ?? "", ...Object.fromEntries(IONS.map(([key]) => [key, p ? String(p[key]) : ""])) }) as WaterProfileFields;
