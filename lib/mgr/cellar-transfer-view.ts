import { batNo } from "./doc-no";
import { isNumber } from "./quantity-input";
import { submitReason } from "./submit-reason";

export type TransferOccupancy = { occupancy_id: string; vessel_id: string; vessel_name: string | null; batch_no: number | null; brand_name: string | null; bbl: number };
export type TransferVessel = { id: string; name: string; capacity_bbl: number };

/** "Pils · B-0409": how every cellar picker names an occupancy. */
export const occupancyIdentity = (o: Pick<TransferOccupancy, "brand_name" | "batch_no">) => [o.brand_name, o.batch_no == null ? null : batNo(o.batch_no)].filter(Boolean).join(" · ");

/** The unstarted plans a transfer can start (list_batches({ open: false })), named like an occupancy: "Pils · B-0420". */
export const plannedBatchChoices = (batches: { id: string; batch_no: number | null; brand_name: string | null }[]) =>
  batches.map(b => ({ id: b.id, label: occupancyIdentity({ ...b, brand_name: b.brand_name ?? "No brand yet" }) }));

/** The tank a cellar sheet starts on when it was opened for none: the only open one, else none, so a choice is never guessed (#1508). */
export const onlyOccupancy = (occupancies: { occupancy_id: string }[]) => occupancies.length === 1 ? occupancies[0].occupancy_id : "";

export function transferPreview(available: number | undefined, volume: string, lossValue: string) {
  const moving = Number(volume), loss = Number(lossValue);
  const remainder = available === undefined ? undefined : Number((available - moving - loss).toFixed(8));
  return { moving, loss, remainder, valid: available !== undefined && Number.isFinite(available) && isNumber(volume) && moving > 0 && (lossValue.trim() === "" || isNumber(lossValue)) && loss >= 0 && remainder !== undefined && remainder >= 0 };
}

/** `plannedBatches` are the unstarted plans this transfer may start; `toBatchId` is the one chosen, "" for none:
 *  the beer then stays in its batch. A planned batch can only start in an empty destination.
 *  `addVesselHref` is New vessel for an admin; null for anyone else (vessels are
 *  admin-managed), and absent in the inventory, whose link stays "#". */
export type CellarTransferViewModel = {
  occupancies: TransferOccupancy[]; vessels: TransferVessel[];
  fromId: string; toId: string; volume: string; loss: string;
  plannedBatches: { id: string; label: string }[]; toBatchId: string;
  addVesselHref?: string | null;
};

/** A source tank is never a transfer destination, including for a stale selection. */
export function transferDestinations(model: CellarTransferViewModel): TransferVessel[] {
  const source = model.occupancies.find(o => o.occupancy_id === model.fromId);
  return model.vessels.filter(v => v.id !== source?.vessel_id);
}

/** The patch for a newly chosen destination. A tank that holds beer keeps its own batch, so the chosen planned batch is dropped. */
export function destinationChange(model: CellarTransferViewModel, toId: string): { toId: string; toBatchId?: "" } {
  return model.occupancies.some(o => o.vessel_id === toId) ? { toId, toBatchId: "" } : { toId };
}

/** What Record transfer still needs. The volume moving must fit the room left in the destination (its capacity
 *  less what it already holds), as record_cellar_transfer refuses more. It also refuses a planned batch in a tank that holds beer. */
export function transferReason(model: CellarTransferViewModel): string | null {
  const source = model.occupancies.find(o => o.occupancy_id === model.fromId);
  const destinations = transferDestinations(model);
  const target = destinations.find(v => v.id === model.toId);
  const preview = transferPreview(source?.bbl, model.volume, model.loss);
  const missing: string[] = [];
  if (!source) missing.push("a source tank with beer");
  if (!destinations.length) missing.push("another vessel to transfer into");
  else if (!target) missing.push("a different destination vessel");
  else {
    const occupied = model.occupancies.find(o => o.vessel_id === target.id);
    const room = Number((target.capacity_bbl - (occupied?.bbl ?? 0)).toFixed(8));
    if (preview.moving > room) missing.push(`at most ${room} bbl into ${target.name}`);
    if (occupied && model.toBatchId) missing.push("an empty destination vessel to start a planned batch");
  }
  if (!isNumber(model.volume) || preview.moving <= 0) missing.push("barrels moving above zero in decimal notation");
  if (model.loss.trim() !== "" && (!isNumber(model.loss) || preview.loss < 0)) missing.push("a loss of zero or more in decimal notation");
  if (source && preview.remainder !== undefined && preview.remainder < 0) missing.push(`at most ${source.bbl} bbl moving and loss combined`);
  return submitReason(missing);
}
