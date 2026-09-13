// app/(app)/materials/count-form.tsx — CommandForm for record_material_count
// (Cycle count sheet): one material, the bin being counted, one number in
// base units. Only the variance posts; the command decides which lot moves.
"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { CycleCountView, CycleCountFooter } from "@/components/mgr/views/cycle-count";
import { E } from "@/components/mgr/e";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
type OnHand = { location_id: string; bin_id: string; qty: number };

export function CountForm({ materialId, materialName, uom, locations, bins, onHand }: {
  materialId: string; materialName: string; uom: string; locations: Location[]; bins: Bin[]; onHand: OnHand[];
}) {
  const formId = useId();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const binsHere = bins.filter((b) => b.location_id === locationId);
  const [binId, setBinId] = useState(binsHere[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const form = useCommandForm("record_material_count", {
    build: () => ({ locationId, binId, lines: [{ materialId, qty: Number(qty) }] }),
    reset: () => setQty(""),
  });
  const system = Number(onHand.find((o) => o.location_id === locationId && o.bin_id === binId)?.qty ?? 0);
  const variance = qty === "" ? null : Number(qty) - system;
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Cycle count" trigger={<Button variant="ghost" size="sm">Count</Button>}
      footer={E.pin(<CycleCountFooter formId={formId} submitting={form.submitting} disabled={!locationId || !binId || qty === "" || !Number.isFinite(Number(qty)) || Number(qty) < 0} />)}>
      <form id={formId} onSubmit={event => {
        if (!locationId || !binId || qty === "" || !Number.isFinite(Number(qty)) || Number(qty) < 0 || form.submitting) { event.preventDefault(); return; }
        void form.submit(event);
      }} className="flex flex-col gap-3">
        <CycleCountView footer={null} model={{
          material: materialName, qty, units: [uom], unitIndex: 0, locationId, binId, locations, bins: binsHere,
          preview: `system ${system.toLocaleString("en-US")}${variance === null ? "" : ` · variance ${variance > 0 ? "+" : ""}${variance.toLocaleString("en-US")}`}${variance ? " · a shortage leaves the earliest best-by lots first; an overage lands on the newest" : ""}`,
          lotPreviewUnavailable: true,
        }} onQuantity={setQty} onBin={setBinId}
          onLocation={value => { setLocationId(value); setBinId(bins.find(bin => bin.location_id === value)?.id ?? ""); }}
          submitting={form.submitting} disabled={!locationId || !binId || qty === "" || !Number.isFinite(Number(qty)) || Number(qty) < 0}
          messages={<CommandFormMessage error={form.error} />} />
      </form>
    </CommandForm>
  );
}
