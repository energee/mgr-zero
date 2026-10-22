// lib/mgr/units-view.ts — view-model for Settings · Units.
// Maps get_gravity_unit onto UnitsView; the preview converts one sample
// reading with formatGravity, from the other unit into the one in effect.
import { formatGravity, GRAVITY_UNITS, gravityUnitLabel, type GravityUnit } from "./gravity-unit";

export type UnitsViewModel = {
  backHref?: string;
  breweryOptions: string[];
  breweryIndex: number;
  mineOptions: string[];
  mineIndex: number;
  /** "A reading of 12.5 °P shows as 1.050 SG." — always a conversion. */
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

const SAMPLE_PLATO = 12.5;
/** The sample reading in one unit, with its symbol: formatGravity leaves SG bare. */
function sampleReading(unit: GravityUnit): string {
  return unit === "sg" ? `${formatGravity(SAMPLE_PLATO, unit)} SG` : formatGravity(SAMPLE_PLATO, unit);
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
    preview: `A reading of ${sampleReading(otherUnit)} shows as ${sampleReading(effective)}.`,
  };
}
