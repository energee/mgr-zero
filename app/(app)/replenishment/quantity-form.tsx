"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { replenishmentQuantityReady } from "@/lib/replenishment-form";

type Sku = { id: string; name: string };

export function QuantityForm({ locationId, skus, kind, values }: {
  locationId: string;
  skus: Sku[];
  kind: "par" | "standing";
  values: Record<string, number>;
}) {
  const id = useId();
  const [skuId, setSkuId] = useState(skus[0]?.id ?? "");
  const [qty, setQty] = useState(String(values[skus[0]?.id] ?? 0));
  const title = kind === "par" ? "Set taproom par" : "Set standing allocation";
  const form = useCommandForm(kind === "par" ? "set_taproom_par" : "set_standing_allocation", {
    build: () => ({ locationId, skuId, ...(kind === "par" ? { parQty: Number(qty) } : { qty: Number(qty) }) }),
    reset: () => { setSkuId(skus[0]?.id ?? ""); setQty(String(values[skus[0]?.id] ?? 0)); },
  });
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title={title}
    trigger={<Button variant="outline" disabled={!skus.length}>{title}</Button>}>
    <form onSubmit={form.submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-sku`}>SKU</Label>
        <select id={`${id}-sku`} className="h-9 rounded-md border bg-background px-3 text-sm" value={skuId} required
          onChange={(e) => { setSkuId(e.target.value); setQty(String(values[e.target.value] ?? 0)); }}>
          {skus.map((sku) => <option key={sku.id} value={sku.id}>{sku.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-qty`}>{kind === "par" ? "Par quantity" : "Reserved quantity"}</Label>
        <Input id={`${id}-qty`} type="number" min="0" step="any" required value={qty} onChange={(e) => setQty(e.target.value)} />
      </div>
      <p className="text-sm text-muted-foreground">{kind === "par" ? "Par is the target stock at this taproom. Zero removes its replenishment target." : "Standing stock is reserved against available-to-promise without an order. Zero releases this taproom’s standing allocation."}</p>
      <CommandFormMessage error={form.error} />
      <CommandFormFooter><Button type="submit" disabled={form.submitting || !replenishmentQuantityReady(skuId, qty)}>{form.submitting ? "Saving…" : title}</Button></CommandFormFooter>
    </form>
  </CommandForm>;
}

export function ReleaseAllocationForm({ allocationId, sku, qty }: { allocationId: string; sku: string; qty: number }) {
  const form = useCommandForm("release_allocation", { build: () => ({ allocationId }), reset: () => {} });
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title="Release standing allocation"
    trigger={<Button variant="destructive" size="sm" aria-label={`Release ${sku} allocation`}>Release</Button>}>
    <form onSubmit={form.submit} className="flex flex-col gap-4">
      <p>Release {qty} units of {sku} back to available-to-promise? This does not move stock or change the taproom par.</p>
      <CommandFormMessage error={form.error} />
      <CommandFormFooter><Button type="submit" variant="destructive" disabled={form.submitting}>{form.submitting ? "Releasing…" : "Release allocation"}</Button></CommandFormFooter>
    </form>
  </CommandForm>;
}
