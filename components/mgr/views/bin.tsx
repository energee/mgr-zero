// components/mgr/views/bin.tsx — Bin sheet (inventory). Live create/edit
// stays bin-form.tsx: E.edit is not a controlled CommandForm.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { BinViewModel } from "@/lib/mgr/bin-view";

export type { BinViewModel };

export function BinView({
  model,
  footer,
}: {
  model: BinViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.edit("Bin name", model.name)}
      {E.info("A location keeps at least one bin. Rename the last one rather than removing it.")}
      {E.note("Tap lines are not bins. The tap board owns those.")}
      {footer !== undefined ? footer : E.btn("Save bin")}
    </>
  );
}
