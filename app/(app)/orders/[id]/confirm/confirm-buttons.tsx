// app/(app)/orders/[id]/confirm/confirm-buttons.tsx — the two verbs on the
// Confirm order review: confirm_order (then back to Orders) and cancel_order
// with a reason.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function ConfirmButtons({ orderId }: { orderId: string }) {
  const router = useRouter();
  const action = useCommandAction();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <CommandFormMessage error={action.error} />
      <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
        <Button disabled={action.busy} onClick={() => void action.run("confirm_order", { orderId }, () => router.push("/orders"))}>{action.busy ? "Confirming…" : "Confirm order"}</Button>
        <CommandForm open={cancelOpen} onOpenChange={setCancelOpen} title="Cancel order" trigger={<Button variant="destructive" disabled={action.busy}>Cancel order</Button>}>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void action.run("cancel_order", { orderId, reason }, () => router.push("/orders")); }}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-cancel-reason">Reason</Label>
              <Input id="confirm-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
            </div>
            <CommandFormFooter><Button type="submit" variant="destructive" disabled={action.busy}>Cancel order</Button></CommandFormFooter>
          </form>
        </CommandForm>
      </div>
    </div>
  );
}
