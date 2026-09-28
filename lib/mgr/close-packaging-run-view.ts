// lib/mgr/close-packaging-run-view.ts — view-model for Close packaging run.
import { isNumber, isPositive } from "./quantity-input";
import { packagingActualsReady, type PackagingActualDraft, type PackagingClosePlan } from "./packaging-actuals";
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

/** When the live Close run form may submit (#433): Barrels drawn and every
 *  actual output must be typed, not blank (an explicit 0 output is allowed). */
export function closeRunReady(f: { bblDrawn: string; actuals: Record<string, string>; lotCode: string; packagedOn: string; locationId: string; binId: string }) {
  return isNumber(f.bblDrawn) && isPositive(f.bblDrawn) && Object.values(f.actuals).every(isNumber)
    && f.lotCode.trim() !== "" && f.packagedOn !== "" && f.locationId !== "" && f.binId !== "";
}

export type PackagingCloseFieldsModel = {
  bblDrawn: string; outputs: { id: string; name: string; qty: string }[];
  lotCode: string; packagedOn: string; bestBy: string; locationId: string; binId: string;
  locations: { id: string; name: string }[]; bins: { id: string; location_id: string; name: string }[];
  plan: PackagingClosePlan; actuals: PackagingActualDraft[];
};

/** The whole close form is ready: typed outputs and fields plus confirmed material actuals. */
export function packagingCloseReady(model: PackagingCloseFieldsModel) {
  return closeRunReady({ ...model, actuals: Object.fromEntries(model.outputs.map(row => [row.id, row.qty])) })
    && packagingActualsReady(model.actuals, model.plan.materials, model.plan.planned.map(row => row.materialId));
}
