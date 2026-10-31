"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { ReceivePoView } from "@/components/mgr/views/receive-po";
import { ReceiptView } from "@/components/mgr/views/receipt";
import { CLOSURE_FORM_ID, CORRECTION_INFO, isCount, poLineDetail, poLineQty, receiveMode, receiveReason, type ReceivePoViewModel } from "@/lib/mgr/receive-po-view";
import { receiptBillRequest, receiptHref, type ReceiptViewModel } from "@/lib/mgr/receipt-view";
import { fromPacks } from "@/lib/mgr/pack-qty";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { countDefaultBin } from "@/lib/mgr/cycle-count-view";
import { discardRecovery } from "@/lib/commands/recovery";
import { dollarsInput, toCents } from "@/lib/mgr/money";

export type PoLine = {
  id: string; material_id: string; qty_ordered: number; qty_received: number; qty_open: number; expected_lot_code: string | null;
  qty_counted?: number; recorded_best_by?: string | null;
  unit_cost_cents?: number | null;
  material: { name: string; purchase_uom: string; purchase_uom_factor: number | null; base_uom: string | null; lot_tracked: boolean } | null;
};
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

/** `today` is the brewery's day (breweryToday on the server page), the received-on default.
 *  `onHand` is the PO's first open material by bin (get_material_on_hand): the
 *  receipt starts on the bin holding the most of it, as a count does (#1507). */
export function ReceiveForm({ poId, lines, locations, bins, onHand, today, model, correctionReceiptId }: { correctionReceiptId?: string; poId: string; lines: PoLine[]; locations: Location[]; bins: Bin[]; onHand: { location_id: string; bin_id: string; qty: number | string }[]; today: string; model: ReceivePoViewModel }) {
  const router = useRouter();
  const mode = receiveMode(model.state);
  const correcting = mode === "correct";
  const receiving = mode === "receive" || correcting;
  const open = mode === "receive" ? lines.filter(line => line.qty_open > 0) : lines;
  const [counts, setCounts] = useState<Record<string, string>>(Object.fromEntries(open.map(line => [line.id, String(line.qty_counted ?? line.qty_open)])));
  const [lots, setLots] = useState<Record<string, string>>(Object.fromEntries(open.map(line => [line.id, line.expected_lot_code ?? ""])));
  const [bestBy, setBestBy] = useState<Record<string, string>>(Object.fromEntries(open.map(line => [line.id, line.recorded_best_by ?? ""])));
  const [costs, setCosts] = useState<Record<string, string>>(Object.fromEntries(open.map(line => [line.id, dollarsInput(line.unit_cost_cents)])));
  const [reason, setReason] = useState("");
  const [closureReason, setClosureReason] = useState("");
  const [start] = useState(() => correcting ? { locationId: model.locationId ?? "", binId: model.binId ?? "" } : countDefaultBin(onHand, locations, bins));
  const [locationId, setLocationId] = useState(start.locationId);
  const binsHere = bins.filter(bin => bin.location_id === locationId);
  const [binId, setBinId] = useState(start.binId);
  const [receivedOn, setReceivedOn] = useState(today);
  const [via, setVia] = useState("mailto");
  const { busy, error, run } = useCommandAction();
  const counted = open.filter(line => isCount(counts[line.id] ?? ""));
  const view: ReceivePoViewModel = {
    ...model, locationId, binId, locations, bins: binsHere, receivedOn, sentVia: via, correctionReason: reason, closureReason,
    lotSuggestionsUnavailable: open.some(line => line.material?.lot_tracked),
    lines: open.map(line => ({
      key: line.id, title: line.material?.name ?? `Line ${line.id}`,
      detail: correcting ? `originally counted ${line.qty_counted} ${line.material?.purchase_uom ?? "purchase units"}` : poLineDetail(line),
      qty: receiving ? counts[line.id] ?? "" : poLineQty(line.qty_ordered, line.material),
      cost: costs[line.id] ?? "",
      lot: line.material?.lot_tracked ? lots[line.id] ?? "" : undefined, bestBy: bestBy[line.id],
      warning: receiving && counts[line.id] !== "" && Number(counts[line.id]) !== line.qty_open,
    })),
    tape: counted.map(line => {
      const count = Number(counts[line.id]), difference = count - line.qty_open;
      const quantity = line.material?.purchase_uom_factor != null ? fromPacks(count, 0, Number(line.material.purchase_uom_factor)) : count;
      return [`+${quantity} ${line.material?.base_uom ?? line.material?.purchase_uom ?? "purchase units"} ${line.material?.name ?? `Line ${line.id}`} · preview`,
        [line.material?.lot_tracked ? `lot ${lots[line.id]?.trim() || "required"}` : undefined, difference === 0 ? "as expected" : `${difference > 0 ? "over" : "short"} ${Math.abs(difference)}`].filter(Boolean).join(" · ")];
    }),
    info: correcting ? CORRECTION_INFO : "Only what you count posts. Over and short are both recorded; the order becomes partially received until every line is met.",
  };
  return <><form className="flex flex-col gap-3" onSubmit={event => {
    event.preventDefault();
    if (busy) return;
    if (mode === "draft") { void run("send_purchase_order", { poId, sentVia: via }); return; }
    if (!receiving || receiveReason(view)) return;
    const countedLines = counted.map(line => ({ poLineId: line.id, qtyCounted: Number(counts[line.id]), unitCostCents: toCents(costs[line.id] ?? ""), lotCode: lots[line.id]?.trim() || undefined, bestBy: bestBy[line.id] || undefined }));
    void run(correcting ? "correct_purchase_receipt" : "receive_purchase_order", correcting
      ? { receiptId: correctionReceiptId, reason, locationId, binId, lines: countedLines }
      : { poId, locationId, binId, receivedOn, lines: countedLines }, data => {
      const receiptId = (data as { receipt_id?: string }).receipt_id;
      if (receiptId) router.push(receiptHref(`/purchase-orders/${poId}`, receiptId));
    });
  }}>
    <ReceivePoView model={view} controls={{
      quantity: (id, value) => setCounts(prev => ({ ...prev, [id]: value })),
      cost: (id, value) => setCosts(prev => ({ ...prev, [id]: value })),
      lot: (id, value) => setLots(prev => ({ ...prev, [id]: value })),
      bestBy: (id, value) => setBestBy(prev => ({ ...prev, [id]: value })),
      location: value => { setLocationId(value); setBinId(bins.find(bin => bin.location_id === value)?.id ?? ""); },
      bin: setBinId, receivedOn: setReceivedOn, sentVia: setVia, reason: setReason,
      closureReason: setClosureReason,
    }} submitting={busy} messages={<CommandFormMessage error={error} />} />
  </form>
  {model.closure && <form id={CLOSURE_FORM_ID} onSubmit={event => {
    event.preventDefault();
    if (busy || !model.closure || !closureReason.trim()) return;
    void run(model.closure === "cancel" ? "cancel_purchase_order" : "close_purchase_order_short", { poId, reason: closureReason });
  }} />}
  </>;
}

/** The shared view owns Bill presentation and confirmation; this adapter only executes the command. */
export function ReceiptBillAdapter({ model }: { model: ReceiptViewModel }) {
  const target = model.bill ? `receipt-bill:${model.bill.receiptId}` : undefined;
  const action = useCommandAction(target);
  const router = useRouter();
  return <ReceiptView model={model} busy={action.busy || Boolean(model.bill?.action && action.pending === undefined)} error={action.error} onPostBill={model.bill?.action ? async () => {
    if (action.busy || action.pending === undefined || !model.bill) return false;
    const request = receiptBillRequest(model.bill, action.pending);
    try {
      if (request.discardRequestId && action.pending) discardRecovery(sessionStorage, action.pending.expectedContext, request.discardRequestId);
    } catch (error) {
      action.setError(error instanceof Error ? error.message : "The previous Bill request is still being sent.");
      return false;
    }
    const posted = await action.run("post_receipt_bill", request.input, undefined, {
      target, requestId: request.requestId, refresh: false,
    });
    // A failed response can still leave a durable unknown outcome. Read its canonical status.
    router.refresh();
    return posted;
  } : undefined} />;
}
