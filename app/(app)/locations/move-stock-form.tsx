// app/(app)/locations/move-stock-form.tsx — CommandForm for move_stock_bin on
// Location bins, drawing the shared MoveStockFields. The page decides whether
// a move is possible (moveStockUnavailable) and the view shows the reason.
"use client";

import { binStockKey, selectedBinStock } from "@/lib/movement-form";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { MoveStockFields } from "@/components/mgr/views/location-bins";
import { useCommandForm } from "@/lib/commands/use-command-form";
import type { BinMoveStock } from "@/lib/commands/inventory";
import { SIZE_LABEL } from "@/lib/mgr/keg-labels";
import type { MoveStockValue } from "@/lib/mgr/location-bins-view";

const EMPTY: MoveStockValue = { source: "", toBinId: "", qty: "", note: "" };

export function MoveStockForm({ bins, stock }: { bins: { id: string; name: string }[]; stock: BinMoveStock[] }) {
  const [value, setValue] = useState(EMPTY);
  const selected = selectedBinStock(stock, value.source);
  const amount = Number(value.qty);
  // The database refuses a move larger than the source bin holds (#451); the
  // form stops it first with the same bound.
  const valid = selected && value.toBinId && value.toBinId !== selected.bin_id && amount > 0 && Number.isFinite(amount) && amount <= Number(selected.qty) && (selected.kind !== "keg" || Number.isInteger(amount));
  const form = useCommandForm("move_stock_bin", {
    build: () => ({
      skuId: selected?.kind === "sku" ? selected.stock_id : undefined,
      skuLotId: selected?.kind === "sku" ? selected.lot_id ?? undefined : undefined,
      materialId: selected?.kind === "material" ? selected.stock_id : undefined,
      materialLotId: selected?.kind === "material" ? selected.lot_id ?? undefined : undefined,
      kegPoolId: selected?.kind === "keg" ? selected.stock_id : undefined,
      kegSize: selected?.keg_size ?? undefined,
      qty: amount, fromBinId: selected?.bin_id, toBinId: value.toBinId, note: value.note || undefined,
    }),
    reset: () => setValue(EMPTY),
  });
  const binNames = new Map(bins.map(b => [b.id, b.name]));
  const binName = (id: string) => binNames.get(id) ?? "Unknown bin";
  const identity = (s: BinMoveStock) => s.kind === "keg" ? SIZE_LABEL[s.keg_size ?? ""] ?? s.keg_size : s.lot_code ? `Lot ${s.lot_code}` : "Untracked stock";
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title="Move stock" trigger={<Button>Move stock</Button>}>
    <form className="flex flex-col gap-4" onSubmit={e => { if (!valid) { e.preventDefault(); return; } void form.submit(e); }}>
      <MoveStockFields value={value} onChange={setValue} options={{
        stock: stock.map(s => ({ value: binStockKey(s), label: `${s.name} · ${binName(s.bin_id)} · ${identity(s)} · ${s.qty} ${s.unit}` })),
        destinations: bins.filter(b => b.id !== selected?.bin_id).map(b => ({ value: b.id, label: b.name })),
        unit: selected?.unit, wholeUnits: selected?.kind === "keg", max: selected ? Number(selected.qty) : undefined,
      }} />
      {valid && <p className="text-sm text-muted-foreground" aria-live="polite">Move {amount} {selected.unit} from {binName(selected.bin_id)} to {binName(value.toBinId)}. The selected lot stays with the stock; location totals stay unchanged.</p>}
      <CommandFormMessage error={form.error} />
      <CommandFormFooter><Button type="submit" disabled={!valid || form.submitting}>{form.submitting ? "Moving…" : "Move stock"}</Button></CommandFormFooter>
    </form>
  </CommandForm>;
}
