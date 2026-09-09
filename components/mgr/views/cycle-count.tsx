// components/mgr/views/cycle-count.tsx — Cycle count inventory sheet. Live
// stays CountForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { CycleCountViewModel } from "@/lib/mgr/cycle-count-view";

export type { CycleCountViewModel };

export function CycleCountView({ model, footer }: { model: CycleCountViewModel; footer?: ReactNode }) {
  return (
    <>
      {E.nav("Material", model.material)}
      {E.qty(model.qty, E.tabs(model.units, model.unitIndex, "w-fit"))}
      {E.info(model.preview)}
      {footer !== undefined ? footer : E.pin(<>{E.btn("Record count", "irr")}</>)}
    </>
  );
}
