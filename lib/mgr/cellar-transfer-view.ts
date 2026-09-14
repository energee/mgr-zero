import { batNo } from "./doc-no";

export type TransferOccupancy = { occupancy_id: string; vessel_id: string; vessel_name: string | null; batch_no: number | null; brand_name: string | null; bbl: number };
export type TransferVessel = { id: string; name: string; capacity_bbl: number };

/** "Pils · B-0409": how every cellar picker names an occupancy. */
export const occupancyIdentity = (o: TransferOccupancy) => [o.brand_name, o.batch_no == null ? null : batNo(o.batch_no)].filter(Boolean).join(" · ");

export function transferPreview(available: number | undefined, volume: string, lossValue: string) {
  const moving = Number(volume), loss = Number(lossValue);
  const remainder = available === undefined ? undefined : Number((available - moving - loss).toFixed(8));
  return { moving, loss, remainder, valid: available !== undefined && Number.isFinite(available) && Number.isFinite(moving) && moving > 0 && Number.isFinite(loss) && loss >= 0 && remainder !== undefined && remainder >= 0 };
}

export type CellarTransferViewModel = {
  occupancies: TransferOccupancy[]; vessels: TransferVessel[];
  fromId: string; toId: string; volume: string; loss: string;
};
