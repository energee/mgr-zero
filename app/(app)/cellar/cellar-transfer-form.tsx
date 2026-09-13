"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { E } from "@/components/mgr/e";
import { CommandForm, CommandFormMessage } from "@/components/mgr/command-form";
import { CellarTransferView, CellarTransferFooter } from "@/components/mgr/views/cellar-transfer";
import { transferPreview, type TransferOccupancy, type TransferVessel } from "@/lib/mgr/cellar-transfer-view";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function CellarTransferForm({ occupancies, vessels }: { occupancies: TransferOccupancy[]; vessels: TransferVessel[] }) {
  const formId = useId();
  const [fields, setFields] = useState({ fromId: "", toId: "", volume: "", loss: "" });
  const source = occupancies.find(o => o.occupancy_id === fields.fromId);
  const ready = transferPreview(source?.bbl, fields.volume, fields.loss).valid && vessels.some(v => v.id === fields.toId && v.id !== source?.vessel_id);
  const form = useCommandForm("record_cellar_transfer", {
    build: () => ({ fromOccupancyId: fields.fromId, toVesselId: fields.toId, volumeBbl: Number(fields.volume), lossBbl: fields.loss ? Number(fields.loss) : undefined }),
    reset: () => setFields({ fromId: "", toId: "", volume: "", loss: "" }),
  });
  return <CommandForm open={form.open} onOpenChange={form.setOpen} title="Cellar transfer" trigger={<Button size="sm" variant="outline">Transfer</Button>} footer={E.pin(<CellarTransferFooter formId={formId} submitting={form.submitting} disabled={!ready} />)}>
    <form id={formId} onSubmit={event => { if (!ready || form.submitting) { event.preventDefault(); return; } void form.submit(event); }} className="flex flex-col gap-3">
      <CellarTransferView model={{ ...fields, occupancies, vessels }} onChange={patch => setFields(current => ({ ...current, ...patch }))} submitting={form.submitting} footer={null} messages={<CommandFormMessage error={form.error} />} />
    </form>
  </CommandForm>;
}
