// components/mgr/views/bin.tsx — shared Bin sheet body, and the confirm both
// surfaces draw before delete_bin. Remove sits in its own section below Save.
import { useId, type ReactNode } from "react";
import Link from "next/link";
import { E } from "@/components/mgr/e";
import type { BinViewModel } from "@/lib/mgr/bin-view";
import { submitReason } from "@/lib/mgr/submit-reason";
import { ConfirmDeleteControl } from "./confirm-delete";

/** What delete_bin refuses (supabase/migrations/20260923220000_delete_bin_keeps_pos_menu.sql):
 *  the last bin, a bin with any recorded movement, and a bin a POS menu uses. */
const REMOVE_RULE = "A location keeps at least one bin. A bin that has ever recorded stock cannot be removed; rename it instead. A bin a POS menu uses cannot be removed until the menu uses another bin.";

/** Confirm, then remove one bin (delete_bin). */
export function RemoveBinControl({ bin, ...rest }: { bin: string; busy?: boolean; error?: string | null; onDelete?: () => Promise<boolean> }) {
  return <ConfirmDeleteControl title={`Remove ${bin}`} triggerLabel="Remove" busyLabel="Removing…" {...rest}
    name={<>Remove the <strong>{bin}</strong> bin?</>}
    warning={REMOVE_RULE} />;
}

export function BinView({
  model,
  controls = {},
  messages,
  footer,
  remove,
}: {
  model: BinViewModel;
  controls?: { name?: (value: string) => void };
  messages?: ReactNode;
  footer?: ReactNode;
  /** Live: the wired RemoveBinControl, or null for a new bin (no section).
   *  Left out (the inventory fixtures), a named bin draws an unwired
   *  RemoveBinControl, as `footer` left out draws a plain Save bin. */
  remove?: ReactNode;
}) {
  const id = useId();
  const removal = remove !== undefined ? remove : model.name ? <RemoveBinControl bin={model.name} /> : null;
  return (
    <>
      {E.edit("Bin name", model.name, "text", undefined, { id: `${id}-name`, onChange: controls.name, required: Boolean(controls.name), error: model.nameError })}
      {E.info(<>Don’t add a bin for each tap. Taps are managed on the <Link href={model.tapBoardHref ?? "#"}>Tap board</Link>.</>)}
      {messages}
      {!model.name.trim() && <p className="text-sm text-muted-foreground">{submitReason(["a bin name"])}</p>}
      {footer !== undefined ? footer : E.btn("Save bin", !model.name.trim() || model.nameError ? "p disabled" : "p")}
      {removal ? <section aria-label="Remove bin" className="mt-2 flex flex-col gap-4 border-t pt-5 @min-[48rem]:flex-row @min-[48rem]:items-center @min-[48rem]:justify-between">
        <div>
          <h2 className="text-sm font-medium">Remove bin</h2>
          <p className="mt-1 text-sm text-muted-foreground">Only an unused bin, never the last one, can be removed.</p>
        </div>
        <div className="shrink-0 self-start">{removal}</div>
      </section> : null}
    </>
  );
}
