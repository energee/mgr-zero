// app/(app)/orders/[id]/confirm/confirm-buttons.tsx — the two verbs on the
// Confirm order review: confirm_order and cancel_order with a reason. A clean
// confirm goes back to Orders; one that returns ATP warnings stays to show them
// (atp-warnings.tsx, shared with the order detail) until "Back to Orders" —
// it skips the post-confirm refresh, which would re-render page.tsx and
// redirect the now-confirmed order away before the warnings are read.
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { AtpWarnings, atpWarnings, type AtpWarning } from "../atp-warnings";

export function ConfirmButtons({ orderId, lines }: { orderId: string; lines: { skuId: string; skuName: string }[] }) {
  const router = useRouter();
  const action = useCommandAction();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [warnings, setWarnings] = useState<AtpWarning[] | null>(null);
  if (warnings) {
    return (
      <div className="flex flex-col gap-2">
        <AtpWarnings warnings={warnings} skuNames={new Map(lines.map((l) => [l.skuId, l.skuName]))} />
        <div className="grid grid-cols-1 gap-2 md:flex md:justify-end">
          <Button onClick={() => { router.push("/orders"); router.refresh(); }}>Back to Orders</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <CommandFormMessage error={action.error} />
      <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
        <Button disabled={action.busy} onClick={() => void action.run("confirm_order", { orderId }, (data) => {
          const next = atpWarnings(data);
          if (next.length > 0) return setWarnings(next);
          router.push("/orders");
          router.refresh();
        }, undefined, { refresh: false })}>{action.busy ? "Confirming…" : "Confirm order"}</Button>
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
