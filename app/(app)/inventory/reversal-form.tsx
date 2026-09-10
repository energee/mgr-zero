"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { ReverseMovementView } from "@/components/mgr/views/reverse-movement";
import { useCommandForm } from "@/lib/commands/use-command-form";
import type { InventoryMovement } from "@/lib/mgr/inventory-detail-view";
import { toReverseMovementViewProps } from "@/lib/mgr/reverse-movement-view";

export function ReversalForm({ movement }: { movement: InventoryMovement }) {
  const [note, setNote] = useState("");
  const form = useCommandForm("reverse_inventory_movement", {
    build: () => ({ movementId: movement.id, note }), reset: () => setNote(""),
  });
  const model = toReverseMovementViewProps({
    qty: Number(movement.qty),
    type: movement.type,
    location: movement.locations?.name ?? movement.location_id,
    bin: movement.bins?.name ?? movement.bin_id,
    lot: movement.lot_id ? movement.lots?.code ?? movement.lot_id : "Untracked",
    bbl: Number(movement.bbl),
    note,
  });
  return <CommandForm title="Reverse movement" trigger={<Button variant="outline">Reverse movement</Button>} open={form.open} onOpenChange={form.setOpen}>
    <form onSubmit={form.submit} className="flex flex-col gap-4">
      <ReverseMovementView
        model={model}
        note={note}
        onNoteChange={setNote}
        footer={<><CommandFormMessage error={form.error} /><CommandFormFooter><Button type="submit" disabled={form.submitting || !note.trim()}>{form.submitting ? "Reversing…" : "Confirm reversal"}</Button></CommandFormFooter></>}
      />
    </form>
  </CommandForm>;
}
