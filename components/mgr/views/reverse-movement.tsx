// components/mgr/views/reverse-movement.tsx — shared Reverse movement sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
      <Field>
        <FieldLabel>Correction note</FieldLabel>
        <Input
          aria-label="Correction note"
          required={Boolean(onNoteChange)}
          value={note}
          defaultValue={note === undefined ? model.note : undefined}
          onChange={onNoteChange ? (event) => onNoteChange(event.target.value) : undefined}
        />
      </Field>
      {footer !== undefined ? footer : E.btn("Confirm reversal")}
    </>
  );
}
