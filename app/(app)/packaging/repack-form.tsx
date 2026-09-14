// app/(app)/packaging/repack-form.tsx — CommandForm for record_repack:
// breaking a composed SKU (a case) into its component SKU at one bin. A
// shape change, never a production or a removal. The user picks the parent,
// the bin and how many; the child SKU and its quantity are derived from the
// parent format's single composition row (page.tsx resolves them), which is
// the only ratio the RPC accepts as volume-neutral.
"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { RepackFooter, RepackView } from "@/components/mgr/views/repack";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toRepackView, type RepackComposition } from "@/lib/mgr/repack-view";

type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
/** A composed SKU the sheet can break: its one child SKU, or null when composition has no single row. */
export type RepackParent = { id: string; label: string; unit: string; child: (RepackComposition & { skuId: string }) | null };

export function RepackForm({ locations, bins, parents }: { locations: Location[]; bins: Bin[]; parents: RepackParent[] }) {
  const formId = useId();
  const [locationId, setLocationId] = useState("");
  const [binId, setBinId] = useState("");
  const [parentSkuId, setParentSkuId] = useState("");
  const [qty, setQty] = useState("");
  const parent = parents.find((p) => p.id === parentSkuId);
  const form = useCommandForm("record_repack", {
    build: () => ({ locationId, binId, parentSkuId, parentQty: Number(qty), childSkuId: parent?.child?.skuId ?? "", childQty: Number(qty) * (parent?.child?.quantity ?? 0) }),
    reset: () => { setLocationId(""); setBinId(""); setParentSkuId(""); setQty(""); },
  });
  const model = toRepackView({
    parent: parent?.label ?? "", unit: parent?.unit ?? "", qty,
    location: [locations.find((l) => l.id === locationId)?.name, bins.find((b) => b.id === binId)?.name].filter(Boolean).join(" · "),
    composition: parent?.child ?? null,
  });
  const disabled = !locationId || !binId || !parent?.child || !(Number(qty) > 0);
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Repack" trigger={<Button size="sm" variant="outline">Repack</Button>}
      footer={E.pin(model.unavailable && parentSkuId ? E.gated("Confirm repack", model.unavailable) : <RepackFooter formId={formId} submitting={form.submitting} disabled={disabled} />)}>
      <form id={formId} onSubmit={(event) => { if (disabled || form.submitting) { event.preventDefault(); return; } void form.submit(event); }} className="flex flex-col gap-3">
        <RepackView model={model} footer={null} submitting={form.submitting} messages={<CommandFormMessage error={form.error} />}
          controls={{
            locations, bins: bins.filter((b) => b.location_id === locationId), parents: parents.map((p) => ({ id: p.id, name: p.label })),
            locationId, binId, parentSkuId,
            onLocation: (id) => { setLocationId(id); setBinId(""); }, onBin: setBinId, onParent: setParentSkuId, onQuantity: setQty,
          }} />
      </form>
    </CommandForm>
  );
}
