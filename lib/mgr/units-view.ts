// lib/mgr/units-view.ts — view-model for Settings · Units.
// Maps get_gravity_unit onto UnitsView; the preview takes a typical reading
// typed in the other unit and shows it as formatGravity would in the unit in effect.
import { sgToPlato } from "@/lib/recipe-gravity";
import { formatGravity, GRAVITY_UNITS, gravityUnitLabel, type GravityUnit } from "./gravity-unit";

export type UnitsViewModel = {
  backHref?: string;
  breweryOptions: string[];
  breweryIndex: number;
  mineOptions: string[];
  mineIndex: number;
  /** "A reading of 12.5 °P shows as 1.050 SG." — the other unit into the one in effect. */
  preview: string;
};

/** get_gravity_unit payload. */
export type UnitsSnapshot = {
  brewery: GravityUnit;
  mine: GravityUnit | null;
  effective: GravityUnit;
  backHref?: string;
};

const breweryOptions = GRAVITY_UNITS.map(gravityUnitLabel);
/** The unit each option position stands for: the chips report a position. */
export const BREWERY_UNITS: readonly GravityUnit[] = GRAVITY_UNITS;
/** Position 0 is "Use brewery default", the null personal override. */
export const MINE_UNITS: readonly (GravityUnit | null)[] = [null, ...GRAVITY_UNITS];

/** A typical wort as typed in each unit, held as the °Plato it is stored as. */
const SAMPLE_PLATO: Record<GravityUnit, number> = { plato: 12.5, sg: sgToPlato(1.05) };
/** A stored Plato figure in one unit, with its symbol: formatGravity leaves SG bare. */
function reading(plato: number, unit: GravityUnit): string {
  return unit === "sg" ? `${formatGravity(plato, unit)} SG` : formatGravity(plato, unit);
}

/** Map a get_gravity_unit payload onto UnitsView. */
export function toUnitsViewProps({ brewery, mine, effective, backHref }: UnitsSnapshot): UnitsViewModel {
  const otherUnit: GravityUnit = effective === "sg" ? "plato" : "sg";
  return {
    backHref,
    breweryOptions,
    breweryIndex: BREWERY_UNITS.indexOf(brewery),
    mineOptions: [`Use brewery default · ${gravityUnitLabel(brewery)}`, ...breweryOptions],
    mineIndex: MINE_UNITS.indexOf(mine),
    preview: `A reading of ${reading(SAMPLE_PLATO[otherUnit], otherUnit)} shows as ${reading(SAMPLE_PLATO[otherUnit], effective)}.`,
  };
}
