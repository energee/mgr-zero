// components/mgr/views/bin.tsx — shared Bin sheet body, and the confirm both
// surfaces draw before delete_bin.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { BinViewModel } from "@/lib/mgr/bin-view";
import { ConfirmDeleteControl } from "./confirm-delete";

export type { BinViewModel };

/** Confirm, then remove one bin (delete_bin). */
export function RemoveBinControl({ bin, ...rest }: { bin: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> }) {
  return <ConfirmDeleteControl title={`Remove ${bin}`} triggerLabel="Remove" busyLabel="Removing…" {...rest}
    name={<>Remove the <strong>{bin}</strong> bin?</>}
    warning="A location keeps at least one bin. A bin with recorded stock, or one a POS menu uses, cannot be removed." />;
}

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
      {footer !== undefined ? footer : <>{model.name ? <RemoveBinControl bin={model.name} /> : null}{E.btn("Save bin")}</>}
    </>
  );
}
