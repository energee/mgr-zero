// app/(app)/orders/[id]/lifecycle-buttons.tsx — status-gated order actions:
// Submit (draft), Confirm (submitted — surfaces confirm_order's ATP soft
// warnings inline), Adjust lines (confirmed/picked, via adjust-lines-form.tsx),
// Record pick (confirmed/picked, via pick-form.tsx), Ship (picked, via
// ship-form.tsx), Cancel with reason (any pre-ship status). Calls commands
// directly rather than through useCommandForm since these aren't
// single-field dialog forms.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBrewery } from "../../brewery-provider";
import { command } from "@/lib/commands/client";
import { AdjustLinesForm } from "./adjust-lines-form";
import { PickForm, type PickLine } from "./pick-form";
import { ShipForm, type ShipLine } from "./ship-form";

type OrderStatus = "draft" | "submitted" | "confirmed" | "picked" | "shipped" | "cancelled";
type Warning = { sku_id: string; atp: number };

export function LifecycleButtons({
  orderId,
  status,
  lines,
  skus,
  pickLines,
}: {
  orderId: string;
  status: OrderStatus;
  lines: { skuId: string; skuName: string; qty: number }[];
  skus: { id: string; label: string }[];
  pickLines: (PickLine & ShipLine)[];
}) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const skuNames = new Map(lines.map((l) => [l.skuId, l.skuName]));

  async function run(name: string) {
    setBusy(true);
    setError(null);
    try {
      const data = (await command(breweryId, name, { orderId })) as { warnings?: Warning[] };
      setWarnings(data.warnings ?? []);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${name} failed`);
    } finally {
      setBusy(false);
    }
  }

  async function submitCancel(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await command(breweryId, "cancel_order", { orderId, reason: cancelReason });
      setCancelOpen(false);
      setCancelReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "cancel_order failed");
    } finally {
      setBusy(false);
    }
  }

  const canCancel = status !== "shipped" && status !== "cancelled";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {status === "draft" && (
          <Button size="sm" disabled={busy} onClick={() => run("submit_order")}>
            Submit
          </Button>
        )}
        {status === "submitted" && (
          <Button size="sm" disabled={busy} onClick={() => run("confirm_order")}>
            Confirm
          </Button>
        )}
        {(status === "confirmed" || status === "picked") && (
          <AdjustLinesForm orderId={orderId} currentLines={lines.map((l) => ({ skuId: l.skuId, qty: l.qty }))} skus={skus} />
        )}
        {(status === "confirmed" || status === "picked") && <PickForm orderId={orderId} lines={pickLines} />}
        {status === "picked" && <ShipForm orderId={orderId} lines={pickLines} />}
        {canCancel && (
          <Dialog
            open={cancelOpen}
            onOpenChange={(next) => {
              setCancelOpen(next);
              if (!next) {
                setCancelReason("");
                setError(null);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" variant="destructive" disabled={busy}>
                Cancel
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel order</DialogTitle>
              </DialogHeader>
              <form onSubmit={submitCancel} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cancel-reason">Reason</Label>
                  <Input id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} required />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <DialogFooter>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Cancelling…" : "Cancel order"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {warnings.length > 0 && (
        <div className="flex flex-col gap-1">
          {warnings.map((w) => (
            <p key={w.sku_id} className="text-sm text-amber-700">
              ATP negative for {skuNames.get(w.sku_id) ?? w.sku_id}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
