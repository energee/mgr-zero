// lib/mgr/gravity-unit.ts — how a gravity is shown and typed. Gravity is
// STORED in °Plato everywhere (breweries.gravity_unit / brewery_users.gravity_unit
// choose the *display* unit only, never the stored one), so every function
// here takes and returns Plato and only the text changes. Pure: no database,
// no React — the server pages resolve the effective unit once (get_gravity_unit)
// and pass it down to whatever prints or reads a gravity.
import { platoToSg, sgToPlato } from "@/lib/recipe-gravity";

/** The two units a brewer may choose to see and type gravity in. */
export type GravityUnit = "plato" | "sg";

export const GRAVITY_UNITS: readonly GravityUnit[] = ["plato", "sg"];

/** The label a person reads for a unit ("Plato", "Specific gravity"). */
export const gravityUnitLabel = (unit: GravityUnit) => (unit === "sg" ? "Specific gravity" : "Plato");

/** The short unit name for a field label: "°Plato" or "SG". */
export const gravityUnitShort = (unit: GravityUnit) => (unit === "sg" ? "SG" : "°Plato");

/** What an empty gravity field should suggest, in the reader's unit. */
export const gravityPlaceholder = (unit: GravityUnit) => (unit === "sg" ? "1.050" : "12.5");

/**
 * A stored Plato figure as the string the brewer reads: `"12.5 °P"` in Plato,
 * `"1.050"` in specific gravity (SG carries no unit suffix — the three
 * decimals and the leading 1 are the notation).
 */
export function formatGravity(plato: number, unit: GravityUnit): string {
  return unit === "sg" ? platoToSg(plato).toFixed(3) : `${plato.toFixed(1)} °P`;
}

/**
 * What the brewer typed, back in stored °Plato — or null when it is not a
 * number at all (the caller decides whether that is an error or an empty
 * optional field). In SG both spellings a brewer uses are accepted: the
 * decimal `1.050` and the "gravity points" shorthand `1050`, which is the
 * same reading with the decimal point left out. Anything at or above 100 is
 * read as points, since no real SG reaches it. A trailing `°P` is tolerated so
 * a value copied out of formatGravity parses straight back.
 */
export function parseGravity(input: string, unit: GravityUnit): number | null {
  const trimmed = input.trim().replace(/\s*°?P$/i, "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  if (unit !== "sg") return n;
  return sgToPlato(n >= 100 ? n / 1000 : n);
}
