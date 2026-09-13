"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { ReceivePoView } from "@/components/mgr/views/receive-po";
import type { ReceivePoViewModel } from "@/lib/mgr/receive-po-view";
import { useCommandAction } from "@/lib/commands/use-command-form";

export type PoLine = {
  id: string; material_id: string; qty_ordered: number; qty_received: number; qty_open: number; expected_lot_code: string | null;
  material: { name: string; purchase_uom: string; purchase_uom_factor: number; base_uom: string; lot_tracked: boolean } | null;
};
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

export function ReceiveForm({ poId, lines, locations, bins, model }: { poId: string; lines: PoLine[]; locations: Location[]; bins: Bin[]; model: ReceivePoViewModel }) {
  const router = useRouter();
  const receiving = model.state === "sent" || model.state === "partially_received";
  const open = receiving ? lines.filter(line => line.qty_open > 0) : lines;
  const [counts, setCounts] = useState<Record<string, string>>(Object.fromEntries(open.map(line => [line.id, String(line.qty_open)])));
  const [lots, setLots] = useState<Record<string, string>>(Object.fromEntries(open.map(line => [line.id, line.expected_lot_code ?? ""])));
  const [bestBy, setBestBy] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const binsHere = bins.filter(bin => bin.location_id === locationId);
  const [binId, setBinId] = useState(binsHere[0]?.id ?? "");
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10));
  const [via, setVia] = useState("mailto");
  const { busy, error, run } = useCommandAction();
  const counted = open.filter(line => counts[line.id] !== "" && Number.isFinite(Number(counts[line.id])) && Number(counts[line.id]) >= 0);
  const lotsOk = counted.every(line => !line.material?.lot_tracked || Number(counts[line.id]) === 0 || lots[line.id]?.trim());
  const ready = Boolean(locationId && binId && receivedOn && counted.length > 0 && lotsOk);
  return <form className="flex flex-col gap-3" onSubmit={event => {
    event.preventDefault();
    if (busy) return;
    if (model.state === "draft") { void run("send_purchase_order", { poId, sentVia: via }); return; }
    if (!receiving || !ready) return;
    void run("receive_purchase_order", {
      poId, locationId, binId, receivedOn,
      lines: counted.map(line => ({ poLineId: line.id, qtyCounted: Number(counts[line.id]), lotCode: lots[line.id]?.trim() || undefined, bestBy: bestBy[line.id] || undefined })),
    }, data => {
      const receiptId = (data as { receipt_id?: string }).receipt_id;
      if (receiptId) router.push(`/purchase-orders/${poId}?receipt=${encodeURIComponent(receiptId)}`);
    });
  }}>
    <ReceivePoView model={{
      ...model, locationId, binId, locations, bins: binsHere, receivedOn, sentVia: via,
      lotSuggestionsUnavailable: open.some(line => line.material?.lot_tracked),
      lines: open.map(line => ({
        key: line.id, title: line.material?.name ?? `Line ${line.id}`,
        detail: `ordered ${line.qty_ordered} · received ${line.qty_received} · still due ${line.qty_open}${line.material ? ` ${line.material.purchase_uom}` : ""}${line.expected_lot_code ? ` · PO lot ${line.expected_lot_code}` : ""}`,
        qty: receiving ? counts[line.id] ?? "" : line.qty_ordered,
        lot: line.material?.lot_tracked ? lots[line.id] ?? "" : undefined, bestBy: bestBy[line.id],
        warning: receiving && counts[line.id] !== "" && Number(counts[line.id]) !== line.qty_open,
      })),
      tape: counted.map(line => {
        const count = Number(counts[line.id]), difference = count - line.qty_open;
        const quantity = line.material ? count * Number(line.material.purchase_uom_factor) : count;
        return [`+${quantity} ${line.material?.base_uom ?? ""} ${line.material?.name ?? `Line ${line.id}`} · preview`,
          [line.material?.lot_tracked ? `lot ${lots[line.id]?.trim() || "required"}` : undefined, difference === 0 ? "as expected" : `${difference > 0 ? "over" : "short"} ${Math.abs(difference)}`].filter(Boolean).join(" · ")];
      }),
      info: "Only what you count posts. Over and short are both recorded; the order becomes partially received until every line is met.",
    }} controls={{
      quantity: (id, value) => setCounts(prev => ({ ...prev, [id]: value })),
      lot: (id, value) => setLots(prev => ({ ...prev, [id]: value })),
      bestBy: (id, value) => setBestBy(prev => ({ ...prev, [id]: value })),
      location: value => { setLocationId(value); setBinId(bins.find(bin => bin.location_id === value)?.id ?? ""); },
      bin: setBinId, receivedOn: setReceivedOn, sentVia: setVia,
    }} submitting={busy} disabled={receiving && !ready} messages={<CommandFormMessage error={error} />} />
  </form>;
}
