// app/(app)/orders/[id]/short-pick-form.tsx — the Short pick sheet
// (screen record "Short pick"): one line counted below ordered, a required
// reason, and exactly one resolution, named by the verb that commits it.
// Opened from pick-form.tsx; state lives in lifecycle-buttons.tsx.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandAction } from "@/lib/commands/use-command-form";
import type { PickLine } from "./pick-form";

export type ShortLine = { line: PickLine; qty: number };

export function ShortPickForm({ orderId, short, onOpenChange }: { orderId: string; short: ShortLine | null; onOpenChange: (open: boolean) => void }) {
  return (
    <CommandForm open={short !== null} onOpenChange={onOpenChange} title={short ? `${short.line.skuName} · short line` : "Short line"}>
      {/* keyed on the line so a new short line starts with its own count */}
      {short && <Fields key={short.line.id} orderId={orderId} short={short} onDone={() => onOpenChange(false)} />}
    </CommandForm>
  );
}

function Fields({ orderId, short, onDone }: { orderId: string; short: ShortLine; onDone: () => void }) {
  const [qty, setQty] = useState(String(short.qty));
  const [reason, setReason] = useState("");
  const { busy, error, run } = useCommandAction();
  const owed = short.line.qtyOrdered - Number(qty || 0);

  async function resolve(resolution: "adjust_down" | "keep_owed") {
    await run("resolve_short_pick", { orderId, lineId: short.line.id, qtyPicked: Number(qty), reason, resolution }, onDone);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void resolve("adjust_down"); }} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="short-qty">Counted (ordered {short.line.qtyOrdered})</Label>
        <Input id="short-qty" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="short-reason">Reason</Label>
        <Input id="short-reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
      </div>
      <p className="text-sm text-muted-foreground">
        Adjusting makes {qty || 0} the order; the customer sees “adjusted”. Keeping {owed} owed leaves the pick open until the rest is counted.
      </p>
      <CommandFormMessage error={error} />
      <CommandFormFooter>
        <Button type="button" variant="outline" disabled={busy || !reason.trim() || owed <= 0} onClick={() => resolve("keep_owed")}>
          Keep {owed} owed
        </Button>
        <Button type="submit" disabled={busy || !reason.trim() || owed <= 0}>
          {busy ? "Saving…" : `Adjust order to ${qty || 0}`}
        </Button>
      </CommandFormFooter>
    </form>
  );
}
