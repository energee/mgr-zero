"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import type { InventoryMovement } from "@/lib/mgr/inventory-detail-view";

export function ReversalForm({ movement }: { movement: InventoryMovement }) {
  const [note, setNote] = useState("");
  const form = useCommandForm("reverse_inventory_movement", {
    build: () => ({ movementId: movement.id, note }), reset: () => setNote(""),
  });
  return <CommandForm title="Reverse movement" trigger={<Button variant="outline">Reverse movement</Button>} open={form.open} onOpenChange={form.setOpen}>
    <form onSubmit={form.submit} className="flex flex-col gap-4">
      <p className="break-all text-sm">{movement.id} · {movement.type} · {movement.qty} units · {movement.bbl} bbl</p>
      <p className="text-sm">Append {-Number(movement.qty)} units and {-Number(movement.bbl)} bbl to {movement.locations?.name ?? movement.location_id} / {movement.bins?.name ?? movement.bin_id}, lot {movement.lot_id ? movement.lots?.code ?? movement.lot_id : "Untracked"}. The original stays in history.</p>
      <Label htmlFor={`reversal-note-${movement.id}`}>Correction note</Label>
      <Input id={`reversal-note-${movement.id}`} required value={note} onChange={e => setNote(e.target.value)} />
      <CommandFormMessage error={form.error} />
      <CommandFormFooter><Button type="submit" disabled={form.submitting || !note.trim()}>{form.submitting ? "Reversing…" : "Confirm reversal"}</Button></CommandFormFooter>
    </form>
  </CommandForm>;
}
