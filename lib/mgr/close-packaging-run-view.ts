// lib/mgr/close-packaging-run-view.ts — view-model for Close packaging run.
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

/** When the live Close run form may submit (#433). Blank Barrels drawn is
 *  not 0 (`Number("")` is), and a blank actual output is not an explicit 0. */
export function closeRunReady(f: { bblDrawn: string; actuals: Record<string, string>; lotCode: string; packagedOn: string; locationId: string; binId: string }) {
  const filled = (s: string) => s.trim() !== "";
  return filled(f.bblDrawn) && Number(f.bblDrawn) > 0 && Object.values(f.actuals).every(filled)
    && filled(f.lotCode) && f.packagedOn !== "" && f.locationId !== "" && f.binId !== "";
}
