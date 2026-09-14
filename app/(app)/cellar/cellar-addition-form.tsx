// app/(app)/cellar/cellar-addition-form.tsx — CommandForm for
// record_batch_addition around the shared CellarAdditionView: a dry hop,
// fruit or adjunct posted against an open occupancy with its lot.
"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { CellarAdditionView, CellarAdditionFooter } from "@/components/mgr/views/cellar-addition";
import { additionPreview, batchLabel, type AdditionLot, type AdditionMaterial, type AdditionStage } from "@/lib/mgr/cellar-addition-view";
import type { TransferOccupancy } from "@/lib/mgr/cellar-transfer-view";
import { useCommandForm } from "@/lib/commands/use-command-form";

const EMPTY = { occupancyId: "", materialId: "", lotId: "", stage: "dry_hop" as AdditionStage, qty: "" };

export function CellarAdditionForm({ occupancies, materials, lotsByMaterial }: { occupancies: TransferOccupancy[]; materials: AdditionMaterial[]; lotsByMaterial: Record<string, AdditionLot[]> }) {
  const formId = useId();
  const [fields, setFields] = useState(EMPTY);
  const occupancy = occupancies.find((o) => o.occupancy_id === fields.occupancyId);
  const ready = Boolean(occupancy) && additionPreview({ material: materials.find((m) => m.id === fields.materialId), lots: lotsByMaterial[fields.materialId] ?? [], lotId: fields.lotId, qty: fields.qty, stage: fields.stage, batch: batchLabel(occupancy) }).valid;
  const form = useCommandForm("record_batch_addition", {
    build: () => ({ occupancyId: fields.occupancyId, materialId: fields.materialId, stage: fields.stage, qty: Number(fields.qty), lotId: fields.lotId || undefined }),
    reset: () => setFields(EMPTY),
  });
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title="Cellar addition" trigger={<Button size="sm" variant="outline">Addition</Button>} footer={E.pin(<CellarAdditionFooter formId={formId} submitting={form.submitting} disabled={!ready} />)}>
    <form id={formId} onSubmit={(event) => { if (!ready || form.submitting) { event.preventDefault(); return; } void form.submit(event); }} className="flex flex-col gap-3">
      <CellarAdditionView model={{ ...fields, occupancies, materials, lotsByMaterial }} onChange={(patch) => setFields((current) => ({ ...current, ...patch }))} submitting={form.submitting} footer={null} messages={<CommandFormMessage error={form.error} />} />
    </form>
  </CommandForm>;
}
