// components/mgr/views/record-movement.tsx — Record movement sheet (inventory).
// Live create stays movement-form.tsx: E.pick / E.qty are not a controlled CommandForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { RecordMovementViewModel } from "@/lib/mgr/record-movement-view";

export type { RecordMovementViewModel };

export function RecordMovementView({
  model,
  footer,
}: {
  model: RecordMovementViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="md:hidden">{E.pick("Kind", model.kind, model.kindOptions)}</div>
      <div className="hidden md:block">{E.chips(model.kindOptions, model.kindIndex)}</div>
      {E.nav("SKU / package", model.sku)}
      {E.pick("Location", model.location, model.locationOptions)}
      {E.pick("Bin", model.bin, model.binOptions)}
      {E.pick("Channel", model.channel, model.channelOptions)}
      {E.pick("Destination state", model.destState, model.destStateOptions)}
      {E.qty(model.qty, E.tabs(model.unitOptions, model.unitIndex, "w-fit"))}
      {E.info(model.preview)}
      {footer !== undefined ? footer : E.pin(<>{E.btn("Record movement", "irr")}</>)}
    </>
  );
}
