// app/(app)/replenishment/quantity-form.tsx — Set taproom par and Set standing
// allocation (one sheet, two commands), plus Release allocation. The sheet
// always opens: with no SKUs its picker says where to add one (noSkus; only
// Admin and Sales open it, the create_sku roles, so the Catalog link always
// shows), and the save names what it still needs (replenishmentQuantityReason).
"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { noSkus } from "@/components/mgr/views/new-transfer";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { replenishmentQuantityReason } from "@/lib/replenishment-form";
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
  // (#1088). The page remounts this form when its values change, so a save's
  // refresh waits until the sheet closes. Warnings only show after a save, so
  // closing over them refreshes; dismissing the unsaved form does not.
  function close(saved: boolean) {
    form.setOpen(false);
    if (saved) router.refresh();
  }
  return <CommandForm open={form.open} onOpenChange={open => open ? form.setOpen(true) : close(warnings.length > 0)} title={spec.title}
    trigger={<Button variant="outline">{spec.title}</Button>}>
    {warnings.length > 0 ? <div className="flex flex-col gap-4">
      <AtpWarnings warnings={warnings} skuNames={new Map(skus.map(sku => [sku.id, sku.name]))} saved="Allocation saved." />
      <CommandFormFooter><Button type="button" onClick={() => close(true)}>Done</Button></CommandFormFooter>
    </div> : <form onSubmit={event => {
      event.preventDefault();
      event.stopPropagation();
      void form.run(spec.command, build(), data => {
        const next = atpWarnings(data);
        if (next.length > 0) setWarnings(next);
        else close(true);
      }, { refresh: false });
    }} className="flex flex-col gap-4">
      {E.pick("SKU", skuId, skus.map((sku) => ({ value: sku.id, label: sku.name })), { id: `${id}-sku`, placeholder: "Select SKU", onChange: (next) => { setSkuId(next); setQty(String(values[next] ?? 0)); }, empty: noSkus("/catalog") })}
      {E.edit(spec.qtyLabel, qty, "number", undefined, { id: `${id}-qty`, min: 0, step: "any", onChange: setQty, required: true })}
      <p className="text-sm text-muted-foreground">{spec.help}</p>
      <CommandFormMessage error={form.error} />
      <CommandFormFooter>{E.submit(spec.title, { submitting: form.submitting, reason: replenishmentQuantityReason(skuId, qty) })}</CommandFormFooter>
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
