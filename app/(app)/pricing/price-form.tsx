// app/(app)/pricing/price-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the set_price command.
// Staff enter dollars; this converts to integer cents before sending (the
// command's unit_price_cents column is integer cents, per schema).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function PriceForm({
  priceListId,
  skus,
}: {
  priceListId: string;
  skus: { id: string; label: string }[];
}) {
  const [skuId, setSkuId] = useState("");
  const [dollars, setDollars] = useState("");
  const form = useCommandForm("set_price", {
    build: () => ({ priceListId, skuId, unitPriceCents: Math.round(Number(dollars) * 100) }),
    reset: () => { setSkuId(""); setDollars(""); },
  });

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Set Price" trigger={<Button variant="outline" size="sm">
          Set Price
        </Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="price-sku">SKU</Label>
            <Select value={skuId} onValueChange={setSkuId}>
              <SelectTrigger id="price-sku">
                <SelectValue placeholder="Select a SKU" />
              </SelectTrigger>
              <SelectContent>
                {skus.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="price-dollars">Unit price (USD)</Label>
            <Input id="price-dollars" type="number" step="0.01" min="0" value={dollars} onChange={(e) => setDollars(e.target.value)} required />
          </div>
          {form.error && <p className="text-sm text-destructive">{form.error}</p>}
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting || !skuId}>
              {form.submitting ? "Saving…" : "Save"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
