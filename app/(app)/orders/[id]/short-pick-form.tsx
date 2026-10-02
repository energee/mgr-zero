"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { useCommandContext } from "@/app/(app)/brewery-provider";
import { pickCountDraftKey, reconcileShortPick } from "@/lib/mgr/pick-counts";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { ShortPickView } from "@/components/mgr/views/short-pick";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toShortPickViewProps, type ShortPickSnapshot } from "@/lib/mgr/short-pick-view";

export function ShortPickForm({ snapshot }: { snapshot: ShortPickSnapshot }) {
  const router = useRouter();
  const committed = useRef(false);
  const [saved, setSaved] = useState(false);
  const key = pickCountDraftKey(useCommandContext(), snapshot.order.id);
  const [qty, setQty] = useState(String(snapshot.line.qty_picked ?? 0));
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState(0);
  const { busy, error, run } = useCommandAction();
  const model = toShortPickViewProps({ ...snapshot, line: { ...snapshot.line, qty_picked: Number(qty) } });
  const disabled = !reason.trim() || qty === "" || !Number.isFinite(Number(qty)) || Number(qty) < 0 || model.missing <= 0;
  return <form className="contents" onSubmit={event => {
    event.preventDefault();
    if (disabled || busy || committed.current) return;
    void run("resolve_short_pick", { orderId: snapshot.order.id, lineId: snapshot.line.id, qtyPicked: Number(qty), reason, resolution: resolution === 0 ? "adjust_down" : "keep_owed" },
      () => {
        committed.current = true; setSaved(true);
        try { reconcileShortPick(sessionStorage, key, snapshot.line.id); }
        catch { toast.error("Short pick saved, but working counts could not be updated. Check the saved quantities on Pick."); }
        router.push(`/orders/${snapshot.order.id}/pick`);
      });
  }}>
    <ShortPickView model={model} countedValue={qty} onCounted={setQty} reasonValue={reason} onReason={setReason}
      resolution={resolution} onResolution={setResolution} submitting={busy || saved} disabled={disabled || saved} messages={<CommandFormMessage error={error} />} />
  </form>;
}
