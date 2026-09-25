// app/(app)/replenishment/replenish-form.tsx — source-warehouse select plus
// an editable par/on-hand/suggested table; submits create_replenishment_order
// (fromLocationId, toLocationId, lines), which creates a confirmed taproom
// transfer order in one step.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { replenishmentLines } from "@/lib/replenishment-form";

type Suggestion = { skuId: string; sku: string; par: number; onHand: number; suggested: number };
type Location = { id: string; name: string };

function initialQtys(suggestions: Suggestion[]) {
  return Object.fromEntries(suggestions.map((s) => [s.skuId, String(s.suggested)]));
}

export function ReplenishForm({
  toLocationId,
  canCreate,
  warehouses,
  suggestions,
}: {
  toLocationId: string;
  canCreate: boolean;
  warehouses: Location[];
  suggestions: Suggestion[];
}) {
  const [fromLocationId, setFromLocationId] = useState(warehouses[0]?.id ?? "");
  const [qtys, setQtys] = useState<Record<string, string>>(() => initialQtys(suggestions));

  const lines = replenishmentLines(suggestions, qtys);
  const form = useCommandForm("create_replenishment_order", {
    build: () => ({ fromLocationId, toLocationId, lines }),
    reset: () => setQtys(initialQtys(suggestions)),
  });

  return (
    <form onSubmit={(e) => {
      if (!canCreate) { e.preventDefault(); return; }
      void form.submit(e);
    }} className="flex flex-col gap-4">
      <div className="flex max-w-xs flex-col gap-2">
        <Label htmlFor="replen-from">From warehouse</Label>
        <Select disabled={!canCreate} value={fromLocationId} onValueChange={setFromLocationId}>
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
                  {E.edit(`${s.sku} transfer quantity`, qtys[s.skuId] ?? "", "number", undefined, { hideLabel: true, disabled: !canCreate, min: 0, step: "any", onChange: qty => setQtys(prev => ({ ...prev, [s.skuId]: qty })) })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">No pars set for this taproom.</p>
      )}

      <CommandFormMessage error={form.error} />
      {canCreate && <div>
        <Button type="submit" disabled={form.submitting || !fromLocationId || lines.length === 0}>
          {form.submitting ? "Creating…" : "Create replenishment order"}
        </Button>
      </div>}
    </form>
  );
}
