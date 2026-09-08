"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { replenishmentQuantityReady } from "@/lib/replenishment-form";

type Sku = { id: string; name: string };

const QUANTITY_KINDS = {
  par: {
    title: "Set taproom par",
    command: "set_taproom_par",
    qtyLabel: "Par quantity",
    qtyKey: "parQty",
    help: "Par is the target stock at this taproom. Zero removes its replenishment target.",
  },
  standing: {
    title: "Set standing allocation",
    command: "set_standing_allocation",
    qtyLabel: "Reserved quantity",
    qtyKey: "qty",
    help: "Standing stock is reserved against available-to-promise without an order. Zero releases this taproom’s standing allocation.",
  },
} as const;

export function QuantityForm({ locationId, skus, kind, values }: {
  locationId: string;
  skus: Sku[];
  kind: keyof typeof QUANTITY_KINDS;
  values: Record<string, number>;
}) {
  const id = useId();
  const spec = QUANTITY_KINDS[kind];
  const [skuId, setSkuId] = useState(skus[0]?.id ?? "");
  const [qty, setQty] = useState(String(values[skus[0]?.id] ?? 0));
  const form = useCommandForm(spec.command, {
    build: () => ({ locationId, skuId, [spec.qtyKey]: Number(qty) }),
    reset: () => { setSkuId(skus[0]?.id ?? ""); setQty(String(values[skus[0]?.id] ?? 0)); },
  });
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title={spec.title}
    trigger={<Button variant="outline" disabled={!skus.length}>{spec.title}</Button>}>
    <form onSubmit={form.submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-sku`}>SKU</Label>
        <Select value={skuId} onValueChange={(next) => { setSkuId(next); setQty(String(values[next] ?? 0)); }}>
          <SelectTrigger id={`${id}-sku`}>
            <SelectValue placeholder="Select SKU" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {skus.map((sku) => <SelectItem key={sku.id} value={sku.id}>{sku.name}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-qty`}>{spec.qtyLabel}</Label>
        <Input id={`${id}-qty`} type="number" min="0" step="any" required value={qty} onChange={(e) => setQty(e.target.value)} />
      </div>
      <p className="text-sm text-muted-foreground">{spec.help}</p>
      <CommandFormMessage error={form.error} />
      <CommandFormFooter><Button type="submit" disabled={form.submitting || !replenishmentQuantityReady(skuId, qty)}>{form.submitting ? "Saving…" : spec.title}</Button></CommandFormFooter>
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
