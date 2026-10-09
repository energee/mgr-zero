// app/(app)/orders/[id]/cancel-order-dialog.tsx — the one Cancel order dialog
// shared by the order detail (lifecycle-buttons.tsx) and the Confirm order
// review (confirm/confirm-buttons.tsx): a required reason, cancel_order's error
// inside the dialog, a busy label, and a reset of reason and error on close (the error also on open).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { useCommandAction } from "@/lib/commands/use-command-form";

export function CancelOrderDialog({ orderId, action, trigger, onCancelled }: {
  orderId: string;
  /** The caller's command action, so its other buttons share busy and error. */
  action: ReturnType<typeof useCommandAction>;
  trigger: React.ReactNode;
  onCancelled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  function changeOpen(next: boolean) {
    setOpen(next);
    // Opening drops a stale Submit/Confirm error; closing resets the form.
    action.setError(null);
    if (!next) setReason("");
  }
  return (
    <CommandForm open={open} onOpenChange={changeOpen} title="Cancel order" trigger={trigger}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void action.run("cancel_order", { orderId, reason }, () => { changeOpen(false); onCancelled(); }); }}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cancel-reason">Reason</Label>
          <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
        </div>
        <CommandFormMessage error={action.error} />
        <CommandFormFooter>
          <Button type="submit" variant="destructive" disabled={action.busy}>{action.busy ? "Cancelling…" : "Cancel order"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
