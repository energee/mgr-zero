// app/(app)/orders/[id]/short-pick-form.tsx — the Short pick sheet over Pick
// (#1503): PickForm mounts it for the line whose Short was tapped, with that
// line's working count. It draws the shared ShortPickView in a CommandForm and
// sends resolve_short_pick; success drops the resolved line from the tab's
// working counts and closes, and the refresh reloads that line on Pick.
"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useCommandContext } from "@/lib/brewery-provider";
import { pickCountDraftKey, reconcileShortPick } from "@/lib/mgr/pick-counts";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { ShortPickView } from "@/components/mgr/views/short-pick";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toShortPickViewProps, type ShortPickSnapshot } from "@/lib/mgr/short-pick-view";

export function ShortPickForm({ snapshot, onClose }: { snapshot: ShortPickSnapshot; onClose: () => void }) {
  const committed = useRef(false);
  const [saved, setSaved] = useState(false);
  const key = pickCountDraftKey(useCommandContext(), snapshot.order.id);
  const [qty, setQty] = useState(String(snapshot.line.qty_picked ?? 0));
  const [reason, setReason] = useState("");
  const { busy, error, run } = useCommandAction();
  const model = toShortPickViewProps({ ...snapshot, line: { ...snapshot.line, qty_picked: Number(qty) } });
  const disabled = !reason.trim() || qty === "" || !Number.isFinite(Number(qty)) || Number(qty) <= 0 || model.missing <= 0;
  return <CommandForm open onOpenChange={open => { if (!open) onClose(); }} title={model.title}>
    <form className="flex flex-col gap-2" onSubmit={event => {
      event.preventDefault();
      if (disabled || busy || committed.current) return;
      void run("resolve_short_pick", { orderId: snapshot.order.id, lineId: snapshot.line.id, qtyPicked: Number(qty), reason, resolution: "adjust_down" },
        () => {
          committed.current = true; setSaved(true);
          try { reconcileShortPick(sessionStorage, key, snapshot.line.id); }
          catch { toast.error("Short pick saved, but working counts could not be updated. Check the saved quantities on Pick."); }
          onClose();
        });
    }}>
      <ShortPickView model={model} countedValue={qty} onCounted={setQty} reasonValue={reason} onReason={setReason}
        submitting={busy || saved} disabled={disabled || saved} messages={<CommandFormMessage error={error} />} />
    </form>
  </CommandForm>;
}
