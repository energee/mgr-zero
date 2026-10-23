// components/mgr/views/movement-recorded.tsx — post-commit echo of Record
// movement, shown in its own sheet after a save. It draws no title or back
// arrow: the sheet (CommandForm live, ScreenSheet in the inventory) names it,
// and Done or the sheet's close dismisses it (#1167).
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { MovementRecordedViewModel } from "@/lib/mgr/movement-recorded-view";

export type { MovementRecordedViewModel };

export function MovementRecordedView({
  model,
  footer,
}: {
  model: MovementRecordedViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.tape([[model.tapeLabel, model.tapeDetail]])}
      {E.fld("SKU", model.sku)}
      {model.details?.map(({ label, value }) => <div key={label}>{E.fld(label, value)}</div>)}
      {footer !== undefined ? footer : E.gated("Record inventory correction", model.correctionGate)}
    </>
  );
}
