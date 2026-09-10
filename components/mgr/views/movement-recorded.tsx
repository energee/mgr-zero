// components/mgr/views/movement-recorded.tsx — post-commit echo. Live Finished
// goods lists the ledger in a footer instead of mounting this receipt.
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
      {E.back("Beer", model.title, undefined, model.backHref)}
      {E.tape([[model.tapeLabel, model.tapeDetail]])}
      {model.details?.map(({ label, value }) => <div key={label}>{E.fld(label, value)}</div>)}
      {footer !== undefined ? footer : E.gated("Record inventory correction", model.correctionGate)}
    </>
  );
}
