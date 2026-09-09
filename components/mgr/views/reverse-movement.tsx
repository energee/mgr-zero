// components/mgr/views/reverse-movement.tsx — Reverse movement sheet
// (inventory). Live stays reversal-form.tsx.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ReverseMovementViewModel } from "@/lib/mgr/reverse-movement-view";

export type { ReverseMovementViewModel };

export function ReverseMovementView({
  model,
  footer,
}: {
  model: ReverseMovementViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.fld("Movement", model.movement)}
      {E.fld("Exact reversal", model.exactReversal)}
      {E.edit("Correction note", model.note)}
      {footer !== undefined ? footer : E.btn("Confirm reversal")}
    </>
  );
}
