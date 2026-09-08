// app/(app)/purchase-orders/[id]/po-actions.tsx — the one next action for a
// purchase order's state. MarkSentForm → send_purchase_order: an attestation
// (mail client or outside MGR), so the page reads "Marked sent", never
// "Delivered". ReceiveForm → receive_purchase_order: counted quantity per
// line (over and short both allowed), lot code and best-by on lot-tracked
// lines prefilled from what the PO named, one bin for the whole receipt.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandAction } from "@/lib/commands/use-command-form";

export type PoLine = {
  id: string; material_id: string; qty_ordered: number; qty_received: number; qty_open: number; expected_lot_code: string | null;
  material: { name: string; purchase_uom: string; purchase_uom_factor: number; base_uom: string; lot_tracked: boolean } | null;
};
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

export function MarkSentForm({ poId }: { poId: string }) {
  const [via, setVia] = useState<"mailto" | "external">("mailto");
  const { busy, error, run } = useCommandAction();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="po-via">How it went out</Label>
      <Select value={via} onValueChange={(v) => setVia(v as "mailto" | "external")}>
        <SelectTrigger id="po-via" className="md:w-fit"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="mailto">From my mail client</SelectItem>
          <SelectItem value="external">Phoned, faxed, or vendor portal</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">MGR records that you sent it today; nothing is emailed from here.</p>
      <CommandFormMessage error={error} />
      <Button className="w-full md:w-fit" disabled={busy} onClick={() => run("send_purchase_order", { poId, sentVia: via })}>Mark sent</Button>
    </div>
  );
}

export function ReceiveForm({ poId, lines, locations, bins }: { poId: string; lines: PoLine[]; locations: Location[]; bins: Bin[] }) {
  const open = lines.filter((l) => l.qty_open > 0);
  const [counts, setCounts] = useState<Record<string, string>>(Object.fromEntries(open.map((l) => [l.id, String(l.qty_open)])));
  const [lots, setLots] = useState<Record<string, string>>(Object.fromEntries(open.map((l) => [l.id, l.expected_lot_code ?? ""])));
  const [bestBy, setBestBy] = useState<Record<string, string>>({});
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const binsHere = bins.filter((b) => b.location_id === locationId);
  const [binId, setBinId] = useState(binsHere[0]?.id ?? "");
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10));
  const { busy, error, run } = useCommandAction();
  const counted = open.filter((l) => counts[l.id] !== "" && Number(counts[l.id]) >= 0);
  const lotsOk = counted.every((l) => !l.material?.lot_tracked || Number(counts[l.id]) === 0 || lots[l.id]?.trim());
  const ready = locationId && binId && receivedOn && counted.length > 0 && lotsOk;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-loc">Received into</Label>
          <Select value={locationId} onValueChange={(v) => { setLocationId(v); setBinId(bins.find((b) => b.location_id === v)?.id ?? ""); }}>
            <SelectTrigger id="rc-loc"><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rc-bin">Bin</Label>
          <Select value={binId} onValueChange={setBinId}>
            <SelectTrigger id="rc-bin"><SelectValue placeholder="Bin" /></SelectTrigger>
            <SelectContent>{binsHere.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="rc-date">Received on</Label>
        <Input id="rc-date" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className="md:w-fit" />
      </div>
      {open.map((l) => (
        <div key={l.id} className="flex flex-col gap-2 rounded-md border p-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>{l.material?.name ?? "—"} <span className="text-muted-foreground">· {l.qty_open} {l.material?.purchase_uom} still due{l.material?.lot_tracked ? (l.expected_lot_code ? ` · lot from the PO: ${l.expected_lot_code}` : " · lot-tracked") : ""}</span></span>
            <Input aria-label={`${l.material?.name ?? "line"} counted`} type="number" min="0" step="any" className="w-24" value={counts[l.id] ?? ""} onChange={(e) => setCounts((p) => ({ ...p, [l.id]: e.target.value }))} />
          </div>
          {l.material?.lot_tracked && (
            <div className="flex gap-2">
              <Input aria-label={`${l.material?.name ?? "line"} lot`} placeholder="Lot code off the package" value={lots[l.id] ?? ""} onChange={(e) => setLots((p) => ({ ...p, [l.id]: e.target.value }))} />
              <Input aria-label={`${l.material?.name ?? "line"} best by`} type="date" value={bestBy[l.id] ?? ""} onChange={(e) => setBestBy((p) => ({ ...p, [l.id]: e.target.value }))} />
            </div>
          )}
        </div>
      ))}
      <p className="text-sm text-muted-foreground">Only what you count posts. Over and short are both recorded; the order becomes partially received until every line is met.</p>
      <CommandFormMessage error={error} />
      <Button className="w-full md:w-fit" disabled={busy || !ready} onClick={() => run("receive_purchase_order", {
        poId, locationId, binId, receivedOn,
        lines: counted.map((l) => ({ poLineId: l.id, qtyCounted: Number(counts[l.id]), lotCode: lots[l.id]?.trim() || undefined, bestBy: bestBy[l.id] || undefined })),
      })}>Receive purchase order</Button>
    </div>
  );
}
