// app/(app)/replenishment/replenish-form.tsx — source-warehouse select plus
// an editable par/on-hand/suggested table; submits create_replenishment_order
// (fromLocationId, toLocationId, lines), which creates a confirmed taproom
// transfer order in one step.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Suggestion = { skuId: string; sku: string; par: number; onHand: number; suggested: number };
type Location = { id: string; name: string };

function initialQtys(suggestions: Suggestion[]) {
  return Object.fromEntries(suggestions.map((s) => [s.skuId, String(s.suggested)]));
}

export function ReplenishForm({
  toLocationId,
  warehouses,
  suggestions,
}: {
  toLocationId: string;
  warehouses: Location[];
  suggestions: Suggestion[];
}) {
  const [fromLocationId, setFromLocationId] = useState(warehouses[0]?.id ?? "");
  const [qtys, setQtys] = useState<Record<string, string>>(() => initialQtys(suggestions));

  const form = useCommandForm("create_replenishment_order", {
    build: () => ({
      fromLocationId,
      toLocationId,
      lines: suggestions
        .filter((s) => Number(qtys[s.skuId] ?? 0) > 0)
        .map((s) => ({ skuId: s.skuId, qty: Number(qtys[s.skuId]) })),
    }),
    reset: () => setQtys(initialQtys(suggestions)),
  });

  return (
    <form onSubmit={form.submit} className="flex flex-col gap-4">
      <div className="flex max-w-xs flex-col gap-2">
        <Label htmlFor="replen-from">From warehouse</Label>
        <Select value={fromLocationId} onValueChange={setFromLocationId}>
          <SelectTrigger id="replen-from">
            <SelectValue placeholder="Select warehouse" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {suggestions.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">SKU</th>
              <th className="py-1 font-normal">Par</th>
              <th className="py-1 font-normal">On hand</th>
              <th className="py-1 font-normal">Suggested</th>
              <th className="py-1 font-normal">Transfer qty</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s) => (
              <tr key={s.skuId} className="border-t">
                <td className="py-1">{s.sku}</td>
                <td className="py-1">{s.par}</td>
                <td className="py-1">{s.onHand}</td>
                <td className="py-1">{s.suggested}</td>
                <td className="py-1">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    className="w-24"
                    value={qtys[s.skuId] ?? ""}
                    onChange={(e) => setQtys((prev) => ({ ...prev, [s.skuId]: e.target.value }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">No pars set for this taproom.</p>
      )}

      {form.error && <p className="text-sm text-red-600">{form.error}</p>}
      <div>
        <Button type="submit" disabled={form.submitting || !fromLocationId || suggestions.length === 0}>
          {form.submitting ? "Creating…" : "Create replenishment order"}
        </Button>
      </div>
    </form>
  );
}
