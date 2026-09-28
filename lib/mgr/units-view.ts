// lib/mgr/units-view.ts — view-model for Settings · Units.
// Maps get_gravity_unit onto UnitsView; the example uses formatGravity.
import { formatGravity, GRAVITY_UNITS, gravityUnitLabel, type GravityUnit } from "./gravity-unit";

export type UnitsViewModel = {
  backHref?: string;
  breweryOptions: string[];
  breweryIndex: number;
  mineOptions: string[];
  mineIndex: number;
  example: string;
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

/** Map a get_gravity_unit payload onto UnitsView. */
export function toUnitsViewProps({ brewery, mine, effective, backHref }: UnitsSnapshot): UnitsViewModel {
  return {
    backHref,
    breweryOptions,
    breweryIndex: BREWERY_UNITS.indexOf(brewery),
    mineOptions: [`Use brewery default (${gravityUnitLabel(brewery)})`, ...breweryOptions],
    mineIndex: MINE_UNITS.indexOf(mine),
    example: formatGravity(12.5, effective),
  };
}
