// lib/mgr/close-packaging-run-view.ts — view-model for Close packaging run.
import { isNumber, isPositive } from "./quantity-input";
import { packagingActualsReady, type PackagingActualDraft, type PackagingClosePlan } from "./packaging-actuals";
import { submitReason } from "./submit-reason";
import { packageQtyError } from "./schedule-packaging-run-view";
export type ClosePackagingRunViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  brand?: string;
  plannedOn?: string;
  /** A cancelled plan shows only its planned facts and the cancelled notice. */
  cancelled?: boolean;
  plannedOutputs?: [string, string | number, string | number][];
  showCloseReview?: boolean;
  closeFields?: PackagingCloseFieldsModel;
  source?: string;

};

export type PackagingCloseFieldsModel = {
  /** whole: a keg output, counted in whole kegs (#1477). */
  bblDrawn: string; outputs: { id: string; name: string; qty: string; whole?: boolean }[];
  lotCode: string; packagedOn: string; bestBy: string; locationId: string; binId: string;
  locations: { id: string; name: string }[]; bins: { id: string; location_id: string; name: string }[];
  plan: PackagingClosePlan; actuals: PackagingActualDraft[];
};

/** Why Close packaging run is withheld, or null when the whole form may submit. Barrels drawn and every actual output must
 *  be typed, not blank (#433; an explicit 0 output is allowed), with the lot, date and finished goods bin, and confirmed
 *  material actuals for every planned material. */
export function packagingCloseReason(model: PackagingCloseFieldsModel): string | null {
  return submitReason([
    ...(isNumber(model.bblDrawn) && isPositive(model.bblDrawn) ? [] : ["barrels drawn above zero"]),
    ...(model.outputs.every(row => row.qty.trim()) ? [] : ["an actual count for every output"]),
    ...(model.outputs.some(row => packageQtyError(row.qty, row.whole)) ? ["valid actual counts (whole numbers for kegs)"] : []),
    ...(model.lotCode.trim() ? [] : ["a lot code"]),
    ...(model.packagedOn ? [] : ["a packaged-on date"]),
    ...(model.locationId ? [] : ["a finished goods location"]),
    ...(model.binId ? [] : ["a finished goods bin"]),
    ...(packagingActualsReady(model.actuals, model.plan.materials, model.plan.planned.map(row => row.materialId)) ? [] : ["complete material actuals for every planned material"]),
  ]);
}
