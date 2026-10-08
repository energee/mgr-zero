// app/(app)/orders/[id]/lifecycle-buttons.tsx — status-gated order actions:
// Submit (draft), Confirm (submitted — surfaces confirm_order's ATP soft
// warnings inline via atp-warnings.tsx), and Cancel with reason (any pre-ship
// status, via cancel-order-dialog.tsx) run here. Adjust lines, Record pick and
// Ship / Complete transfer are links to their own pages under /orders/[id]/. Calls commands directly rather
// than through useCommandForm since these aren't single-field command forms.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { AtpWarnings, atpWarnings, type AtpWarning } from "./atp-warnings";
import { CancelOrderDialog } from "./cancel-order-dialog";

type OrderStatus = "draft" | "submitted" | "confirmed" | "picked" | "shipped" | "cancelled";

export function LifecycleButtons({
  orderId,
  status,
  lines,
  transfer = false,
  canSell,
  canFulfill,
}: {
  transfer?: boolean;
  canSell: boolean;
  canFulfill: boolean;
  orderId: string;
  status: OrderStatus;
  lines: { skuId: string; skuName: string }[];
}) {
  const router = useRouter();
  const action = useCommandAction();
  const { busy, error, run: runAction } = action;
  const [warnings, setWarnings] = useState<AtpWarning[]>([]);

  const skuNames = new Map(lines.map((l) => [l.skuId, l.skuName]));

  async function run(name: string) {
    await runAction(name, { orderId }, data => {
      setWarnings(atpWarnings(data));
      router.refresh();
    });
  }

  const canCancel = canSell && status !== "shipped" && status !== "cancelled";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {canSell && status === "draft" && (
          <Button size="sm" disabled={busy} onClick={() => run("submit_order")}>
            Submit
          </Button>
        )}
        {canSell && status === "submitted" && (
          <Button size="sm" disabled={busy} onClick={() => run("confirm_order")}>
            Confirm
          </Button>
        )}
        {canSell && (status === "confirmed" || status === "picked") && (
          <Button size="sm" variant="outline" asChild><Link href={`/orders/${orderId}/adjust`}>Adjust lines</Link></Button>
        )}
        {canFulfill && (status === "confirmed" || status === "picked") && (
          <Button size="sm" asChild><Link href={`/orders/${orderId}/pick`}>Record pick</Link></Button>
        )}
        {canFulfill && status === "picked" && <Button size="sm" asChild><Link href={`/orders/${orderId}/${transfer ? "complete" : "ship"}`}>{transfer ? "Complete transfer" : "Ship"}</Link></Button>}
        {canCancel && (
          <CancelOrderDialog orderId={orderId} action={action} trigger={<Button size="sm" variant="destructive" disabled={busy}>Cancel</Button>} onCancelled={() => router.refresh()} />
        )}
      </div>
      <CommandFormMessage error={error} />
      <AtpWarnings warnings={warnings} skuNames={skuNames} />
    </div>
  );
}
