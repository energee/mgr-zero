// app/(app)/pricing/price-format-form.tsx — CommandForm for set_price_list_format:
// the group's default price for one format (every SKU on that format sells at
// it unless overridden). Dollars in, integer cents out.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function PriceFormatForm({ priceListId, formats }: { priceListId: string; formats: { id: string; name: string }[] }) {
  const [formatId, setFormatId] = useState("");
  const [dollars, setDollars] = useState("");
  const form = useCommandForm("set_price_list_format", {
    build: () => ({ priceListId, formatId, unitPriceCents: Math.round(Number(dollars) * 100) }),
    reset: () => { setFormatId(""); setDollars(""); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Format price" trigger={<Button variant="outline" size="sm">Format price</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="price-format">Format</Label>
          <NativeSelect id="price-format" value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            <option value="">Select a format</option>
            {formats.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="price-format-dollars">Unit price (USD)</Label>
          <Input id="price-format-dollars" type="number" step="0.01" min="0" value={dollars} onChange={(e) => setDollars(e.target.value)} required />
        </div>
        <p className="text-sm text-muted-foreground">Every SKU on this format sells at this price on this list unless it has its own override.</p>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !formatId}>{form.submitting ? "Saving…" : "Save"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
