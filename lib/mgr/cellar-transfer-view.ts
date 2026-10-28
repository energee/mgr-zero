import { batNo } from "./doc-no";
import { isNumber } from "./quantity-input";
import { submitReason } from "./submit-reason";

export type TransferOccupancy = { occupancy_id: string; vessel_id: string; vessel_name: string | null; batch_no: number | null; brand_name: string | null; bbl: number };
export type TransferVessel = { id: string; name: string; capacity_bbl: number };

/** "Pils · B-0409": how every cellar picker names an occupancy. */
export const occupancyIdentity = (o: TransferOccupancy) => [o.brand_name, o.batch_no == null ? null : batNo(o.batch_no)].filter(Boolean).join(" · ");

/** The tank a cellar sheet starts on when it was opened for none: the only open one, else none, so a choice is never guessed (#1508). */
export const onlyOccupancy = (occupancies: { occupancy_id: string }[]) => occupancies.length === 1 ? occupancies[0].occupancy_id : "";

export function transferPreview(available: number | undefined, volume: string, lossValue: string) {
  const moving = Number(volume), loss = Number(lossValue);
  const remainder = available === undefined ? undefined : Number((available - moving - loss).toFixed(8));
  return { moving, loss, remainder, valid: available !== undefined && Number.isFinite(available) && isNumber(volume) && moving > 0 && (lossValue.trim() === "" || isNumber(lossValue)) && loss >= 0 && remainder !== undefined && remainder >= 0 };
}

export type CellarTransferViewModel = {
  occupancies: TransferOccupancy[]; vessels: TransferVessel[];
  fromId: string; toId: string; volume: string; loss: string;
};

/** A source tank is never a transfer destination, including for a stale selection. */
export function transferDestinations(model: CellarTransferViewModel): TransferVessel[] {
  const source = model.occupancies.find(o => o.occupancy_id === model.fromId);
  return model.vessels.filter(v => v.id !== source?.vessel_id);
}

export function transferReason(model: CellarTransferViewModel): string | null {
  const source = model.occupancies.find(o => o.occupancy_id === model.fromId);
  const preview = transferPreview(source?.bbl, model.volume, model.loss);
  const missing: string[] = [];
  if (!source) missing.push("a source tank with beer");
  if (!transferDestinations(model).some(v => v.id === model.toId)) missing.push("a different destination vessel");
  if (!isNumber(model.volume) || preview.moving <= 0) missing.push("barrels moving above zero in decimal notation");
  if (model.loss.trim() !== "" && (!isNumber(model.loss) || preview.loss < 0)) missing.push("a loss of zero or more in decimal notation");
  if (source && preview.remainder !== undefined && preview.remainder < 0) missing.push(`at most ${source.bbl} bbl moving and loss combined`);
  return submitReason(missing);
}
