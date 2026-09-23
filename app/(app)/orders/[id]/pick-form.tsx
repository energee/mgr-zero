"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { PickView } from "@/components/mgr/views/pick";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toPickViewProps, type PickSnapshot } from "@/lib/mgr/pick-view";

export type PickLine = { id: string; skuName: string; qtyOrdered: number; qtyPicked: number | null };

export function PickForm({ snapshot }: { snapshot: PickSnapshot }) {
  const router = useRouter();
  const [qtys, setQtys] = useState<Record<string, string>>(() => Object.fromEntries(snapshot.lines.map(line => [line.id, String(line.qty_picked ?? line.qty_ordered)])));
  const { busy, error, setError, run } = useCommandAction();
  const model = toPickViewProps({ ...snapshot, lines: snapshot.lines.map(line => ({ ...line, qty_picked: Number(qtys[line.id]) })) });
  return <form className="contents" onSubmit={event => {
    event.preventDefault();
    // A cleared field is not a count of 0 (#433).
    if (snapshot.lines.some(line => !qtys[line.id]?.trim())) return setError("Enter a picked quantity for every line.");
    void run("record_pick", { orderId: snapshot.order.id, picks: snapshot.lines.map(line => ({ lineId: line.id, qty: Number(qtys[line.id]) })) }, () => router.push(`/orders/${snapshot.order.id}`));
  }}>
    <PickView model={model} quantities={qtys} onQuantity={(id, value) => setQtys(prev => ({ ...prev, [id]: value }))}
      onShort={id => router.push(`/orders/${snapshot.order.id}/short-pick?line=${encodeURIComponent(id)}&qty=${encodeURIComponent(qtys[id])}`)}
      onPrint={() => window.print()} submitting={busy} messages={<CommandFormMessage error={error} />} />
  </form>;
}
