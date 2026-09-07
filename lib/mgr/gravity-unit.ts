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
 * The answer when the brewer typed something that is not a gravity at all.
 * Distinct from null (an empty optional field) on purpose: a form must be able
 * to say "that is not a number" rather than quietly record no gravity, which is
 * how a mistyped reading used to vanish.
 */
export const INVALID_GRAVITY = Symbol("invalid gravity");

/** Plato, or null for an empty field, or INVALID_GRAVITY for unreadable input. */
export type ParsedGravity = number | null | typeof INVALID_GRAVITY;

// The widest gravity a brewer can actually read: water to a barleywine wort,
// with headroom. Outside it the entry is a typo, not a reading.
const MAX_PLATO = 40;

/**
 * What the brewer typed, back in stored °Plato. Empty input is null — an
 * optional field nobody filled in. Anything unreadable, or a number no
 * hydrometer could produce, is INVALID_GRAVITY so the caller can show a field
 * error. In SG both spellings a brewer uses are accepted: the decimal `1.050`
 * and the "gravity points" shorthand `1050`, which is the same reading with the
 * decimal point left out. Anything at or above 100 is read as points, since no
 * real SG reaches it. A trailing `°P` is tolerated so a value copied out of
 * formatGravity parses straight back.
 */
export function parseGravity(input: string, unit: GravityUnit): ParsedGravity {
  const trimmed = input.trim().replace(/\s*°?P$/i, "").trim();
  if (trimmed === "") return null;
  // Number() is deliberately not the gate: it reads "" as 0, "Infinity" as
  // infinite and tolerates whitespace, none of which is a typed gravity.
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return INVALID_GRAVITY;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return INVALID_GRAVITY;

  if (unit !== "sg") return n >= 0 && n <= MAX_PLATO ? n : INVALID_GRAVITY;

  const sg = n >= 100 ? n / 1000 : n;
  if (sg < 0.9 || sg > 1.2) return INVALID_GRAVITY;
  return sgToPlato(sg);
}
