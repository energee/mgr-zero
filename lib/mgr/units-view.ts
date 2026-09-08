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
};

const breweryOptions = GRAVITY_UNITS.map(gravityUnitLabel);
const mineOptions = ["Use brewery default", ...breweryOptions];

/** Map a get_gravity_unit payload onto UnitsView. */
export function toUnitsViewProps({ brewery, mine, effective }: UnitsSnapshot): UnitsViewModel {
  return {
    backHref: "/settings",
    breweryOptions,
    breweryIndex: GRAVITY_UNITS.indexOf(brewery),
    mineOptions,
    mineIndex: mine == null ? 0 : GRAVITY_UNITS.indexOf(mine) + 1,
    example: formatGravity(12.5, effective),
  };
}
