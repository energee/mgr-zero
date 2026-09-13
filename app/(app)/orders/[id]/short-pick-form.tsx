"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { ShortPickView } from "@/components/mgr/views/short-pick";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toShortPickViewProps, type ShortPickSnapshot } from "@/lib/mgr/short-pick-view";

export function ShortPickForm({ snapshot }: { snapshot: ShortPickSnapshot }) {
  const router = useRouter();
  const [qty, setQty] = useState(String(snapshot.line.qty_picked ?? 0));
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState(0);
  const { busy, error, run } = useCommandAction();
  const model = toShortPickViewProps({ ...snapshot, line: { ...snapshot.line, qty_picked: Number(qty) } });
  const disabled = !reason.trim() || qty === "" || !Number.isFinite(Number(qty)) || Number(qty) < 0 || model.missing <= 0;
  return <form className="contents" onSubmit={event => {
    event.preventDefault();
    if (disabled || busy) return;
    void run("resolve_short_pick", { orderId: snapshot.order.id, lineId: snapshot.line.id, qtyPicked: Number(qty), reason, resolution: resolution === 0 ? "adjust_down" : "keep_owed" },
      () => router.push(`/orders/${snapshot.order.id}/pick`));
  }}>
    <ShortPickView model={model} countedValue={qty} onCounted={setQty} reasonValue={reason} onReason={setReason}
      resolution={resolution} onResolution={setResolution} submitting={busy} disabled={disabled} messages={<CommandFormMessage error={error} />} />
  </form>;
}
