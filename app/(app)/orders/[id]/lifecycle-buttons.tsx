// app/(app)/orders/[id]/lifecycle-buttons.tsx — status-gated order actions:
// Submit (draft), Confirm (submitted — surfaces confirm_order's ATP soft
// warnings inline), Adjust lines (confirmed/picked, via adjust-lines-form.tsx),
// Record pick (confirmed/picked, via pick-form.tsx; a short count opens
// short-pick-form.tsx), Ship (picked, via
// ship-form.tsx), Cancel with reason (any pre-ship status). Calls commands
// directly rather than through useCommandForm since these aren't
// single-field command forms.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { AdjustLinesForm } from "./adjust-lines-form";
import type { PickLine } from "./pick-form";
import type { ShipLine } from "./ship-form";

type OrderStatus = "draft" | "submitted" | "confirmed" | "picked" | "shipped" | "cancelled";
type Warning = { sku_id: string; atp: number };

export function LifecycleButtons({
  orderId,
  orderNo,
  status,
  lines,
  skus,
  pickLines,
  transfer = false,
  canSell,
  canFulfill,
}: {
  transfer?: boolean;
  canSell: boolean;
  canFulfill: boolean;
  orderId: string;
  orderNo?: number | null;
  status: OrderStatus;
  lines: { skuId: string; skuName: string; qty: number }[];
  skus: { id: string; label: string }[];
  pickLines: (PickLine & ShipLine)[];
}) {
  const router = useRouter();
  const { busy, error, setError, run: runAction } = useCommandAction();
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const skuNames = new Map(lines.map((l) => [l.skuId, l.skuName]));

  async function run(name: string) {
    await runAction(name, { orderId }, data => {
      const result = data as { warnings?: Warning[] };
      setWarnings(result.warnings ?? []);
      router.refresh();
    });
  }

  async function submitCancel(e: React.FormEvent) {
    e.preventDefault();
    await runAction("cancel_order", { orderId, reason: cancelReason }, () => {
      setCancelOpen(false);
      setCancelReason("");
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
          <AdjustLinesForm orderId={orderId} orderNo={orderNo} currentLines={lines.map((l) => ({ skuId: l.skuId, qty: l.qty, qtyPicked: pickLines.find(pick => pick.skuId === l.skuId)?.qtyPicked }))} skus={skus} />
        )}
        {canFulfill && (status === "confirmed" || status === "picked") && (
          <Button size="sm" asChild><Link href={`/orders/${orderId}/pick`}>Record pick</Link></Button>
        )}
        {canFulfill && status === "picked" && <Button size="sm" asChild><Link href={`/orders/${orderId}/${transfer ? "complete" : "ship"}`}>{transfer ? "Complete transfer" : "Ship"}</Link></Button>}
        {canCancel && (
          <CommandForm open={cancelOpen} onOpenChange={(next) => { setCancelOpen(next); if (!next) { setCancelReason(""); setError(null); } }} title="Cancel order" trigger={<Button size="sm" variant="destructive" disabled={busy}>
                Cancel
              </Button>}>
              <form onSubmit={submitCancel} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cancel-reason">Reason</Label>
                  <Input id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} required />
                </div>
                <CommandFormMessage error={error} />
                <CommandFormFooter>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Cancelling…" : "Cancel order"}
                  </Button>
                </CommandFormFooter>
              </form>
            </CommandForm>
        )}
      </div>
      <CommandFormMessage error={error} />
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {warnings.map((w) => (
            <CommandFormMessage key={w.sku_id} tone="warning">
              ATP negative for {skuNames.get(w.sku_id) ?? w.sku_id}
            </CommandFormMessage>
          ))}
        </div>
      )}
    </div>
  );
}
