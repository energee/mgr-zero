// app/(app)/packaging/repack-form.tsx — CommandForm for record_repack:
// breaking a composed SKU (a case) into its component SKU at one bin. A
// shape change, never a production or a removal. The user picks the parent,
// the bin and how many; the child SKU and its quantity come from
// list_repack_parents (the parent format's single composition row), which is
// the only ratio the RPC accepts as volume-neutral. The Lot picker offers the
// parent's lots in the chosen bin (get_bin_move_stock, as Record movement
// does); both legs are written to that lot (#613).
"use client";

import { useEffect, useId, useState } from "react";
import { command } from "@/lib/commands/client";
import type { BinMoveStock } from "@/lib/commands/inventory";
import { useBrewery } from "../brewery-provider";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { repackFooter, RepackView } from "@/components/mgr/views/repack";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toRepackView } from "@/lib/mgr/repack-view";

type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
/** One list_repack_parents row: a composed SKU and the child it breaks into, or null when composition has no single row. */
export type RepackParent = { id: string; label: string; unit: string; bblPerUnit: number; child: { skuId: string; unit: string; quantity: number } | null };

export function RepackForm({ locations, bins, parents, autoOpen = false }: { autoOpen?: boolean; locations: Location[]; bins: Bin[]; parents: RepackParent[] }) {
  const formId = useId();
  const breweryId = useBrewery();
  const [locationId, setLocationId] = useState("");
  const [binId, setBinId] = useState("");
  const [parentSkuId, setParentSkuId] = useState("");
  const [lotId, setLotId] = useState("");
  const [qty, setQty] = useState("");
  const [stock, setStock] = useState<BinMoveStock[]>([]);
  const [stockError, setStockError] = useState<string | null>(null);
  const parent = parents.find((p) => p.id === parentSkuId);
  const child = parent?.child ?? null;
  const form = useCommandForm("record_repack", {
    defaultOpen: autoOpen,
    build: () => ({ locationId, binId, parentSkuId, parentQty: Number(qty), childSkuId: child?.skuId ?? "", childQty: Number(qty) * (child?.quantity ?? 0), lotId: lotId || undefined }),
    reset: () => { setLocationId(""); setBinId(""); setParentSkuId(""); setLotId(""); setQty(""); setStock([]); setStockError(null); },
  });
  useEffect(() => {
    if (!locationId || !form.open) return;
    let live = true;
    command(breweryId, "get_bin_move_stock", { locationId }).then(data => { if (live) { setStock(data as BinMoveStock[]); setStockError(null); } }).catch(err => { if (live) setStockError(String(err)); });
    return () => { live = false; };
  }, [breweryId, locationId, form.open]);
  const lots = stock.filter((s) => s.kind === "sku" && s.stock_id === parentSkuId && s.bin_id === binId && s.lot_id)
    .map((s) => ({ id: s.lot_id!, name: `${s.lot_code} · ${s.qty} available` }));
  const model = {
    ...toRepackView({
      parent: parent?.label ?? "", unit: parent?.unit ?? "", qty,
      composition: child && parent ? { childLabel: child.unit, quantity: child.quantity, parentBbl: parent.bblPerUnit } : null,
    }),
    parents: parents.map((p) => ({ id: p.id, name: p.label })),
    locations, bins: bins.filter((b) => b.location_id === locationId), lots,
    parentSkuId, locationId, binId, lotId,
  };
  const disabled = !locationId || !binId || !child || !(Number(qty) > 0);
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Repack" trigger={<Button size="sm" variant="outline">Repack</Button>}
      footer={repackFooter(model, { formId, submitting: form.submitting, disabled })}>
      <form id={formId} onSubmit={form.submit} className="flex flex-col gap-3">
        <RepackView model={model} footer={null} submitting={form.submitting} messages={<><CommandFormMessage error={stockError} /><CommandFormMessage error={form.error} /></>}
          onParent={(id) => { setParentSkuId(id); setLotId(""); }} onLocation={(id) => { setLocationId(id); setBinId(""); setLotId(""); }}
          onBin={(id) => { setBinId(id); setLotId(""); }} onLot={setLotId} onQuantity={setQty} />
      </form>
    </CommandForm>
  );
}
