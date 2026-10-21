"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { replenishmentQuantityReady } from "@/lib/replenishment-form";
import { AtpWarnings, atpWarnings, type AtpWarning } from "@/app/(app)/orders/[id]/atp-warnings";

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
  const router = useRouter();
  const spec = QUANTITY_KINDS[kind];
  const [skuId, setSkuId] = useState(skus[0]?.id ?? "");
  const [qty, setQty] = useState(String(values[skus[0]?.id] ?? 0));
  const [warnings, setWarnings] = useState<AtpWarning[]>([]);
  const build = () => ({ locationId, skuId, [spec.qtyKey]: Number(qty) });
  const form = useCommandForm(spec.command, {
    build,
    reset: () => { setSkuId(skus[0]?.id ?? ""); setQty(String(values[skus[0]?.id] ?? 0)); setWarnings([]); },
  });
  // A save that leaves ATP negative keeps the sheet open to show the warning
  // (#1088). The page remounts this form when its values change, so the
  // refresh waits until the sheet closes.
  function setOpen(open: boolean) {
    form.setOpen(open);
    if (!open) router.refresh();
  }
  return <CommandForm open={form.open} onOpenChange={setOpen} title={spec.title}
    trigger={<Button variant="outline" disabled={!skus.length}>{spec.title}</Button>}>
    {warnings.length > 0 ? <div className="flex flex-col gap-4">
      <AtpWarnings warnings={warnings} skuNames={new Map(skus.map(sku => [sku.id, sku.name]))} />
      <CommandFormFooter><Button type="button" onClick={() => setOpen(false)}>Done</Button></CommandFormFooter>
    </div> : <form onSubmit={event => {
      event.preventDefault();
      event.stopPropagation();
      void form.run(spec.command, build(), data => {
        const next = atpWarnings(data);
        if (next.length > 0) setWarnings(next);
        else setOpen(false);
      }, { refresh: false });
    }} className="flex flex-col gap-4">
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
      {E.edit(spec.qtyLabel, qty, "number", undefined, { id: `${id}-qty`, min: 0, step: "any", onChange: setQty, required: true })}
      <p className="text-sm text-muted-foreground">{spec.help}</p>
      <CommandFormMessage error={form.error} />
      <CommandFormFooter><Button type="submit" disabled={form.submitting || !replenishmentQuantityReady(skuId, qty)}>{form.submitting ? "Saving…" : spec.title}</Button></CommandFormFooter>
    </form>}
  </CommandForm>;
}

export function ReleaseAllocationForm({ allocationId, sku, qty }: { allocationId: string; sku: string; qty: number }) {
  const form = useCommandForm("release_allocation", { build: () => ({ allocationId }), reset: () => {}, target: allocationId });
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title="Release standing allocation"
    trigger={<Button variant="destructive" size="sm" aria-label={`Release ${sku} allocation`}>Release</Button>}>
    <form onSubmit={form.submit} className="flex flex-col gap-4">
      <p>Release {qty} units of {sku} back to available-to-promise? This does not move stock or change the taproom par.</p>
      <CommandFormMessage error={form.error} />
      <CommandFormFooter><Button type="submit" variant="destructive" disabled={form.submitting}>{form.submitting ? "Releasing…" : "Release allocation"}</Button></CommandFormFooter>
    </form>
  </CommandForm>;
}
