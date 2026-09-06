// app/(app)/orders/[id]/pick-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the record_pick
// command. Pre-fills each line's picked qty with its current qty_picked (or
// qty_ordered if not yet picked); submitting sets the order to "picked".
"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";

export type PickLine = { id: string; skuName: string; qtyOrdered: number; qtyPicked: number | null };

function initialQtys(lines: PickLine[]) {
  return Object.fromEntries(lines.map((l) => [l.id, String(l.qtyPicked ?? l.qtyOrdered)]));
}

export function PickForm({ orderId, lines }: { orderId: string; lines: PickLine[] }) {
  const [qtys, setQtys] = useState<Record<string, string>>(() => initialQtys(lines));
  // Per-line qty inputs need real ids so each Label is programmatically linked (audit 2026-09-05, a11y #5).
  const idBase = useId();

  const form = useCommandForm("record_pick", {
    build: () => ({
      orderId,
      picks: lines.map((l) => ({ lineId: l.id, qty: Number(qtys[l.id] ?? 0) })),
    }),
    reset: () => setQtys(initialQtys(lines)),
  });

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Record pick" trigger={<Button size="sm">Record pick</Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {lines.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <Label htmlFor={`${idBase}-${l.id}`} className="flex-1 font-normal">
                  {l.skuName} (ordered {l.qtyOrdered})
                </Label>
                <Input
                  id={`${idBase}-${l.id}`}
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
          <CommandFormMessage error={form.error} />
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? "Saving…" : "Save"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
