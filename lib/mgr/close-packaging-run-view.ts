// lib/mgr/close-packaging-run-view.ts — view-model for Close packaging run.
import { isNumber, isPositive } from "./quantity-input";
export type ClosePackagingRunViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  brand?: string;
  plannedOn?: string;
  plannedOutputs?: [string, string | number, string | number][];
  showCloseReview?: boolean;
  source?: string;
  needRows?: [string, string, string][];
  shortNote?: string;
  packaged?: string;
  lot?: string;
  lotOptions?: string[];
  destination?: string;
  destinationOptions?: string[];
  labelsDamaged?: string;
  endsDamaged?: string;
  writeOff?: string;
  writeOffOptions?: string[];
  tape?: [string, string][];
};

/** When the live Close run form may submit (#433): Barrels drawn and every
 *  actual output must be typed, not blank (an explicit 0 output is allowed). */
export function closeRunReady(f: { bblDrawn: string; actuals: Record<string, string>; lotCode: string; packagedOn: string; locationId: string; binId: string }) {
  return isNumber(f.bblDrawn) && isPositive(f.bblDrawn) && Object.values(f.actuals).every(isNumber)
    && f.lotCode.trim() !== "" && f.packagedOn !== "" && f.locationId !== "" && f.binId !== "";
}
