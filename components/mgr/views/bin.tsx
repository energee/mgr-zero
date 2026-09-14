// components/mgr/views/bin.tsx — shared Bin sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { BinViewModel } from "@/lib/mgr/bin-view";

export type { BinViewModel };

export function BinView({
  model,
  controls = {},
  messages,
  footer,
}: {
  model: BinViewModel;
  controls?: { name?: (value: string) => void };
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.edit("Bin name", model.name, "text", undefined, { onChange: controls.name, required: Boolean(controls.name) })}
      {E.info("A location keeps at least one bin. Rename the last one rather than removing it.")}
      {E.note("Tap lines are not bins. The tap board owns those.")}
      {messages}
      {footer !== undefined ? footer : E.btn("Save bin")}
    </>
  );
}
