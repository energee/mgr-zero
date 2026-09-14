// app/(app)/packaging/repack-form.tsx — CommandForm for record_repack:
// breaking a composed SKU (a case) into its component SKU at one bin. A
// shape change, never a production or a removal. The user picks the parent,
// the bin and how many; the child SKU and its quantity come from
// list_repack_parents (the parent format's single composition row), which is
// the only ratio the RPC accepts as volume-neutral.
"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { repackFooter, RepackView } from "@/components/mgr/views/repack";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toRepackView } from "@/lib/mgr/repack-view";

type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
/** One list_repack_parents row: a composed SKU and the child it breaks into, or null when composition has no single row. */
export type RepackParent = { id: string; name: string; brand: string | null; unit: string; bblPerUnit: number; child: { skuId: string; unit: string; quantity: number } | null };

export function RepackForm({ locations, bins, parents }: { locations: Location[]; bins: Bin[]; parents: RepackParent[] }) {
  const formId = useId();
  const [locationId, setLocationId] = useState("");
  const [binId, setBinId] = useState("");
  const [parentSkuId, setParentSkuId] = useState("");
  const [qty, setQty] = useState("");
  const parent = parents.find((p) => p.id === parentSkuId);
  const child = parent?.child ?? null;
  const form = useCommandForm("record_repack", {
    build: () => ({ locationId, binId, parentSkuId, parentQty: Number(qty), childSkuId: child?.skuId ?? "", childQty: Number(qty) * (child?.quantity ?? 0) }),
    reset: () => { setLocationId(""); setBinId(""); setParentSkuId(""); setQty(""); },
  });
  const model = {
    ...toRepackView({
      parent: parent?.name ?? "", unit: parent?.unit ?? "", qty,
      location: [locations.find((l) => l.id === locationId)?.name, bins.find((b) => b.id === binId)?.name].filter(Boolean).join(" · "),
      composition: child && parent ? { childLabel: child.unit, quantity: child.quantity, parentBbl: parent.bblPerUnit } : null,
    }),
    parents: parents.map((p) => ({ id: p.id, name: p.brand ? `${p.brand} — ${p.name}` : p.name })),
    locations, bins: bins.filter((b) => b.location_id === locationId),
    parentSkuId, locationId, binId,
  };
  const disabled = !locationId || !binId || !child || !(Number(qty) > 0);
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Repack" trigger={<Button size="sm" variant="outline">Repack</Button>}
      footer={repackFooter(model, { formId, submitting: form.submitting, disabled })}>
      <form id={formId} onSubmit={form.submit} className="flex flex-col gap-3">
        <RepackView model={model} footer={null} submitting={form.submitting} messages={<CommandFormMessage error={form.error} />}
          onParent={setParentSkuId} onLocation={(id) => { setLocationId(id); setBinId(""); }} onBin={setBinId} onQuantity={setQty} />
      </form>
    </CommandForm>
  );
}
