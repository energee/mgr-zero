// components/mgr/views/reverse-movement.tsx — shared Reverse movement sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ReverseMovementViewModel } from "@/lib/mgr/reverse-movement-view";

export type { ReverseMovementViewModel };

export function ReverseMovementView({
  model,
  note,
  onNoteChange,
  footer,
}: {
  model: ReverseMovementViewModel;
  note?: string;
  onNoteChange?: (value: string) => void;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.fld("Movement", model.movement)}
      {E.fld("Exact reversal", model.exactReversal)}
      {E.edit("Correction note", String((note ?? (note === undefined ? model.note : undefined)) ?? ""), "text", undefined, { onChange: onNoteChange ? (nextValue: string) => onNoteChange(nextValue) : undefined, required: Boolean(onNoteChange) })}
      {footer !== undefined ? footer : E.btn("Confirm reversal")}
    </>
  );
}
