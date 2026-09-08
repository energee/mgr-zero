// app/(app)/orders/[id]/complete/complete-button.tsx — the one write on the
// Complete transfer page: ship_order for a taproom transfer, every line at
// its picked quantity, no invoice, then back to the order.
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandAction } from "@/lib/commands/use-command-form";

export function CompleteButton({ orderId, ship }: { orderId: string; ship: { lineId: string; qty: number }[] }) {
  const router = useRouter();
  const { busy, error, run } = useCommandAction();
  return (
    <div className="flex flex-col gap-2">
      <CommandFormMessage error={error} />
      <Button className="w-full md:w-fit" disabled={busy} onClick={() => void run("ship_order", { orderId, ship, invoiceTiming: "now" }, () => router.push(`/orders/${orderId}`))}>
        {busy ? "Completing…" : "Complete transfer"}
      </Button>
    </div>
  );
}
