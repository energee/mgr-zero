// app/(app)/orders/[id]/adjust-lines-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the
// adjust_order_lines command. Pre-fills the current order lines (edit qty,
// remove, or add a new sku row) and requires a reason; the command replaces
// the full line set and re-syncs allocations server-side.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type LineRow = { skuId: string; qty: string };

export function AdjustLinesForm({
  orderId,
  currentLines,
  skus,
}: {
  orderId: string;
  currentLines: { skuId: string; qty: number }[];
  skus: { id: string; label: string }[];
}) {
  const initialLines: LineRow[] = currentLines.map((l) => ({ skuId: l.skuId, qty: String(l.qty) }));
  const [lines, setLines] = useState<LineRow[]>(initialLines);
  const [reason, setReason] = useState("");

  function reset() {
    setLines(currentLines.map((l) => ({ skuId: l.skuId, qty: String(l.qty) })));
    setReason("");
  }

  const form = useCommandForm("adjust_order_lines", {
    build: () => ({
      orderId,
      reason,
      lines: lines.filter((l) => l.skuId && l.qty).map((l) => ({ skuId: l.skuId, qty: Number(l.qty) })),
    }),
    reset,
  });

  function updateLine(index: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { skuId: "", qty: "" }]);
  }
  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Adjust lines" trigger={<Button size="sm" variant="outline">
          Adjust lines
        </Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Lines</Label>
            {lines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={line.skuId} onValueChange={(v) => updateLine(i, { skuId: v })}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select SKU" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {skus.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Qty"
                  className="w-24"
                  value={line.qty}
                  onChange={(e) => updateLine(i, { qty: e.target.value })}
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(i)} disabled={lines.length <= 1}>
                  Remove
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              Add line
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="adjust-reason">Reason</Label>
            <Input id="adjust-reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
          </div>
          {form.error && <p className="text-sm text-destructive">{form.error}</p>}
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting}>
              {form.submitting ? "Saving…" : "Save"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
