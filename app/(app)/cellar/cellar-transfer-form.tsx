"use client";
import { useId, useState } from "react";
import { E } from "@/components/mgr/e";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { CellarTransferView, CellarTransferFooter } from "@/components/mgr/views/cellar-transfer";
import { onlyOccupancy, transferPreview, transferReason, type TransferOccupancy, type TransferVessel } from "@/lib/mgr/cellar-transfer-view";
import { useCommandForm } from "@/lib/commands/use-command-form";

/** `disabled` is the map's actionsOff: no tank holds beer, and the map's note says why (#1115).
 *  `fromId` is the tank the page is about (Vessel detail, a batch); without one the sheet starts on the only open tank (#1508). */
export function CellarTransferForm({ occupancies, vessels, disabled, fromId = onlyOccupancy(occupancies) }: { occupancies: TransferOccupancy[]; vessels: TransferVessel[]; disabled?: boolean; fromId?: string }) {
  const formId = useId();
  const empty = { fromId, toId: "", volume: "", loss: "" };
  const [fields, setFields] = useState(empty);
  const model = { ...fields, occupancies, vessels };
  const source = occupancies.find(o => o.occupancy_id === fields.fromId);
  const preview = transferPreview(source?.bbl, fields.volume, fields.loss);
  const reason = transferReason(model);
  const form = useCommandForm("record_cellar_transfer", {
    build: () => ({ fromOccupancyId: fields.fromId, toVesselId: fields.toId, volumeBbl: preview.moving, lossBbl: fields.loss ? preview.loss : undefined }),
    reset: () => setFields(empty),
  });
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title="Cellar transfer" trigger={E.btn("Transfer", disabled ? "g disabled" : "g")} footer={E.pin(<CellarTransferFooter formId={formId} submitting={form.submitting} reason={reason} />)}>
    <form id={formId} onSubmit={event => { if (reason || form.submitting) { event.preventDefault(); return; } void form.submit(event); }} className="flex flex-col gap-3">
      <CellarTransferView model={model} onChange={patch => setFields(current => ({ ...current, ...patch }))} submitting={form.submitting} footer={null} messages={<CommandFormMessage error={form.error} />} />
    </form>
  </CommandForm>;
}
