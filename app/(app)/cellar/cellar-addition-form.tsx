// app/(app)/cellar/cellar-addition-form.tsx — CommandForm for
// record_batch_addition around the shared CellarAdditionView: a dry hop,
// fruit or adjunct posted against an open occupancy with its lot. `disabled`
// is the map's actionsOff: no tank holds beer, and the map's note says why (#1115).
// `occupancyId` is the tank the page is about (Vessel detail, a batch); without
// one the sheet starts on the only open tank (#1508).
"use client";
import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { CellarAdditionView, CellarAdditionFooter } from "@/components/mgr/views/cellar-addition";
import { additionPreview, additionReason, type AdditionLot, type AdditionMaterial, type AdditionStage } from "@/lib/mgr/cellar-addition-view";
import type { TransferOccupancy } from "@/lib/mgr/cellar-transfer-view";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { onlyOccupancy } from "@/lib/mgr/cellar-transfer-view";

const EMPTY = { materialId: "", lotId: "", stage: "dry_hop" as AdditionStage, qty: "" };

export function CellarAdditionForm({ occupancies, materials, lotsByMaterial, disabled, occupancyId = onlyOccupancy(occupancies) }: { occupancies: TransferOccupancy[]; materials: AdditionMaterial[]; lotsByMaterial: Record<string, AdditionLot[]>; disabled?: boolean; occupancyId?: string }) {
  const formId = useId();
  const empty = { ...EMPTY, occupancyId };
  const [fields, setFields] = useState(empty);
  const model = { ...fields, occupancies, materials, lotsByMaterial };
  const preview = additionPreview(model);
  const reason = additionReason(preview);
  const form = useCommandForm("record_batch_addition", {
    build: () => {
      if (!preview.valid) throw new Error(preview.need);
      return { occupancyId: fields.occupancyId, materialId: fields.materialId, stage: fields.stage, qty: preview.qty, lotId: fields.lotId || undefined };
    },
    reset: () => setFields(empty),
  });
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title="Cellar addition" trigger={E.btn("Addition", disabled ? "g disabled" : "g")} footer={E.pin(<CellarAdditionFooter formId={formId} submitting={form.submitting} reason={reason} />)}>
    <form id={formId} onSubmit={(event) => { if (reason || form.submitting) { event.preventDefault(); return; } void form.submit(event); }} className="flex flex-col gap-3">
      <CellarAdditionView model={model} onChange={(patch) => setFields((current) => ({ ...current, ...patch }))} submitting={form.submitting} footer={null} messages={<CommandFormMessage error={form.error} />} />
    </form>
  </CommandForm>;
}
