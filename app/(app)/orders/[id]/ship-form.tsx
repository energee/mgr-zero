// app/(app)/orders/[id]/ship-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the ship_order
// command. The plpgsql fn requires the ship array to cover every order line,
// so unpicked/held-back lines are sent with qty 0; qty defaults to each
// line's qty_picked. On success shows a link to the created invoice when the
// order shipped anything on a wholesale order (taproom transfers get none);
// "Invoice on delivery" defers it to confirm_delivery.
// useCommandAction retains the request identity across unchanged retries.
"use client";

import { useId, useState } from "react";
import { useEffect } from "react";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { ShipSources } from "@/lib/commands/orders";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBrewery } from "../../brewery-provider";
import { command } from "@/lib/commands/client";

export type ShipLine = { id: string; skuId: string; skuName: string; qtyPicked: number | null };

function initialQtys(lines: ShipLine[]) {
  return Object.fromEntries(lines.map((l) => [l.id, String(l.qtyPicked ?? 0)]));
}

export function ShipForm({ orderId, lines, transfer = false }: { orderId: string; lines: ShipLine[]; transfer?: boolean }) {
  const breweryId = useBrewery();
  const [open, setOpen] = useState(false);
  const { busy, error, setError, run } = useCommandAction();
  const [available, setAvailable] = useState<ShipSources | null>(null);
  const [allocations, setAllocations] = useState<Record<string, { key: string; qty: string; toBinId: string }[]>>({});
  useEffect(() => {
    if (!open) return;
    let live = true;
    command(breweryId, "get_order_ship_sources", { orderId }).then(data => { if (live) setAvailable(data as ShipSources); }).catch(err => { if (live) setError(String(err)); });
    return () => { live = false; };
  }, [open, breweryId, orderId, setError]);
  const [qtys, setQtys] = useState<Record<string, string>>(() => initialQtys(lines));
  // Per-line qty inputs need real ids so each Label is programmatically linked (audit 2026-09-05, a11y #5).
  const idBase = useId();
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [onDelivery, setOnDelivery] = useState(false);
  const [shipped, setShipped] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  function reset() {
    setQtys(initialQtys(lines));
    setAllocations({});
    setAvailable(null);
    setCarrier("");
    setTracking("");
    setOnDelivery(false);
    setError(null);
    setShipped(false);
    setInvoiceId(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await run("ship_order", {
      orderId, carrier: carrier || undefined, tracking: tracking || undefined,
      invoiceTiming: onDelivery ? "on_delivery" : "now",
      ship: lines.map(l => ({ lineId: l.id, qty: Number(qtys[l.id]), sources: Number(qtys[l.id]) === 0 ? [] : (allocations[l.id] ?? []).map(a => {
        const source = available?.stock.find(s => `${s.bin_id}:${s.lot_id ?? ""}` === a.key && s.stock_id === l.skuId);
        return { binId: source?.bin_id, lotId: source?.lot_id ?? null, qty: Number(a.qty), toBinId: a.toBinId || undefined };
      }) })),
    }, data => { setInvoiceId((data as { invoice_id: string | null }).invoice_id); setShipped(true); });
  }
  function patch(line: string, index: number, change: Partial<{ key: string; qty: string; toBinId: string }>) {
    setAllocations(prev => ({ ...prev, [line]: prev[line].map((a, n) => n === index ? { ...a, ...change } : a) }));
  }

  return (
    <CommandForm open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }} title={transfer ? "Complete transfer" : "Ship order"} trigger={<Button size="sm">{transfer ? "Complete transfer" : "Ship"}</Button>}>
        {shipped ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm">{transfer ? "Transfer completed." : "Order shipped."}</p>
            {invoiceId ? (
              <Link href={`/invoices/${invoiceId}`} className="text-sm underline underline-offset-2">
                View invoice
              </Link>
            ) : (
              <p className="text-sm text-muted-foreground">{onDelivery ? "Invoice waits for delivery confirmation." : "No invoice was created."}</p>
            )}
            <CommandFormFooter>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </CommandFormFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {lines.map((l) => (
                <div key={l.id} className="flex flex-col gap-2 border-b pb-3">
                  <Label htmlFor={`${idBase}-${l.id}`} className="flex-1 font-normal">
                    {l.skuName} (picked {l.qtyPicked ?? 0})
                  </Label>
                  <Input
                    id={`${idBase}-${l.id}`}
                    type="number"
                    min="0"
                    max={l.qtyPicked ?? 0}
                    required
                    step="0.01"
                    className="w-24"
                    value={qtys[l.id] ?? ""}
                    onChange={(e) => setQtys((prev) => ({ ...prev, [l.id]: e.target.value }))}
                  />
                  {(allocations[l.id] ?? []).map((a, n) => <div key={n} className="flex flex-col gap-2">
                    <Label htmlFor={`${idBase}-${l.id}-source-${n}`}>Source {n + 1}</Label>
                    <select id={`${idBase}-${l.id}-source-${n}`} className="min-w-0 rounded border p-2" required value={a.key} onChange={e => patch(l.id, n, { key: e.target.value })}>
                      <option value="">Choose bin and lot</option>
                      {available?.stock.filter(s => s.stock_id === l.skuId).map(s => <option key={`${s.bin_id}:${s.lot_id}`} value={`${s.bin_id}:${s.lot_id ?? ""}`}>{available.bins.find(b => b.id === s.bin_id)?.name} · {s.lot_code ?? "Untracked / legacy stock"} · {s.qty} available</option>)}
                    </select>
                    <Label htmlFor={`${idBase}-${l.id}-source-qty-${n}`}>Source quantity</Label>
                    <Input id={`${idBase}-${l.id}-source-qty-${n}`} type="number" min="0.01" step="0.01" required value={a.qty} onChange={e => patch(l.id, n, { qty: e.target.value })} />
                    {!!available?.destinationBins.length && <><Label htmlFor={`${idBase}-${l.id}-destination-${n}`}>Destination bin</Label><select id={`${idBase}-${l.id}-destination-${n}`} className="rounded border p-2" required value={a.toBinId} onChange={e => patch(l.id, n, { toBinId: e.target.value })}><option value="">Choose destination</option>{available.destinationBins.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></>}
                    <Button type="button" variant="ghost" onClick={() => setAllocations(prev => ({ ...prev, [l.id]: prev[l.id].filter((_, index) => index !== n) }))}>Remove source</Button>
                  </div>)}
                  {Number(qtys[l.id]) > 0 && <Button type="button" variant="outline" disabled={!available} onClick={() => setAllocations(prev => ({ ...prev, [l.id]: [...(prev[l.id] ?? []), { key: "", qty: "", toBinId: "" }] }))}>Add source</Button>}
                </div>
              ))}
            </div>
            {!transfer && <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="ship-carrier">Carrier</Label>
                <Input id="ship-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="ship-tracking">Tracking</Label>
                <Input id="ship-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} />
              </div>
            </div>}
            {!transfer && <Label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={onDelivery} onChange={(e) => setOnDelivery(e.target.checked)} />
              Invoice on delivery
            </Label>}
            <CommandFormMessage error={error} />
            <CommandFormFooter>
              <Button type="submit" disabled={busy || !available || lines.some(l => Number(qtys[l.id]) > 0 && !(allocations[l.id]?.length))}>
                {busy ? "Saving…" : transfer ? "Complete transfer" : onDelivery ? "Ship, invoice on delivery" : "Ship and invoice"}
              </Button>
            </CommandFormFooter>
          </form>
        )}
      </CommandForm>
  );
}
