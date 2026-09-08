"use client";

import { binStockKey, selectedBinStock } from "@/lib/movement-form";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import type { BinMoveStock } from "@/lib/commands/inventory";

export function MoveStockForm({ bins, stock }: { bins: { id: string; name: string }[]; stock: BinMoveStock[] }) {
  const [source, setSource] = useState("");
  const [toBinId, setToBinId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const selected = selectedBinStock(stock, source);
  const amount = Number(qty);
  const valid = selected && toBinId && toBinId !== selected.bin_id && amount > 0 && Number.isFinite(amount) && (selected.kind !== "keg" || Number.isInteger(amount));
  const form = useCommandForm("move_stock_bin", {
    build: () => ({
      skuId: selected?.kind === "sku" ? selected.stock_id : undefined,
      skuLotId: selected?.kind === "sku" ? selected.lot_id ?? undefined : undefined,
      materialId: selected?.kind === "material" ? selected.stock_id : undefined,
      materialLotId: selected?.kind === "material" ? selected.lot_id ?? undefined : undefined,
      kegPoolId: selected?.kind === "keg" ? selected.stock_id : undefined,
      kegSize: selected?.keg_size ?? undefined,
      qty: amount, fromBinId: selected?.bin_id, toBinId, note: note || undefined,
    }),
    reset: () => { setSource(""); setToBinId(""); setQty(""); setNote(""); },
  });
  const binName = (id: string) => bins.find(b => b.id === id)?.name ?? "Unknown bin";
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title="Move stock" trigger={<Button disabled={bins.length < 2 || stock.length === 0}>Move stock</Button>}>
    <form className="flex flex-col gap-4" onSubmit={e => { if (!valid) { e.preventDefault(); return; } void form.submit(e); }}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bin-stock">Stock and source bin</Label>
        <Select value={source} onValueChange={v => { setSource(v); setToBinId(""); setQty(""); }}>
          <SelectTrigger id="bin-stock"><SelectValue placeholder="Choose stock" /></SelectTrigger>
          <SelectContent>{stock.map(s => <SelectItem key={binStockKey(s)} value={binStockKey(s)}>{s.name} · {binName(s.bin_id)} · {s.kind === "keg" ? s.keg_size?.replace(/_/g, " ") : s.lot_code ? `Lot ${s.lot_code}` : "Untracked stock"} · {s.qty} {s.unit}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bin-destination">Destination bin</Label>
        <Select value={toBinId} onValueChange={setToBinId} disabled={!selected}>
          <SelectTrigger id="bin-destination"><SelectValue placeholder="Choose a different bin" /></SelectTrigger>
          <SelectContent>{bins.filter(b => b.id !== selected?.bin_id).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2"><Label htmlFor="bin-qty">Quantity{selected ? ` (${selected.unit})` : ""}</Label><Input id="bin-qty" type="number" min={selected?.kind === "keg" ? "1" : "0.0001"} step={selected?.kind === "keg" ? "1" : "0.0001"} value={qty} onChange={e => setQty(e.target.value)} required /></div>
      <div className="flex flex-col gap-2"><Label htmlFor="bin-note">Note</Label><Input id="bin-note" value={note} onChange={e => setNote(e.target.value)} /></div>
      {valid && <p className="text-sm text-muted-foreground" aria-live="polite">Move {amount} {selected.unit} from {binName(selected.bin_id)} to {binName(toBinId)}. The selected lot stays with the stock; location totals stay unchanged.</p>}
      <CommandFormMessage error={form.error} />
      <CommandFormFooter><Button type="submit" disabled={!valid || form.submitting}>{form.submitting ? "Moving…" : "Move stock"}</Button></CommandFormFooter>
    </form>
  </CommandForm>;
}
