// app/(app)/orders/[id]/pick-form.tsx — dialog form for the record_pick
// command. Pre-fills each line's picked qty with its current qty_picked (or
// qty_ordered if not yet picked); submitting sets the order to "picked".
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";

export type PickLine = { id: string; skuName: string; qtyOrdered: number; qtyPicked: number | null };

function initialQtys(lines: PickLine[]) {
  return Object.fromEntries(lines.map((l) => [l.id, String(l.qtyPicked ?? l.qtyOrdered)]));
}

export function PickForm({ orderId, lines }: { orderId: string; lines: PickLine[] }) {
  const [qtys, setQtys] = useState<Record<string, string>>(() => initialQtys(lines));

  const form = useCommandForm("record_pick", {
    build: () => ({
      orderId,
      picks: lines.map((l) => ({ lineId: l.id, qty: Number(qtys[l.id] ?? 0) })),
    }),
    reset: () => setQtys(initialQtys(lines)),
  });

  return (
    <Dialog open={form.open} onOpenChange={form.setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Record pick</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record pick</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {lines.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <Label className="flex-1 font-normal">
                  {l.skuName} (ordered {l.qtyOrdered})
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  className="w-24"
                  value={qtys[l.id] ?? ""}
                  onChange={(e) => setQtys((prev) => ({ ...prev, [l.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          {form.error && <p className="text-sm text-red-600">{form.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
