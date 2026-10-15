// app/(app)/pricing/barcode-form.tsx — one price group × format UPC: every SKU
// on the group scans as it for that format, unless the SKU has its own. A sheet
// over set_price_group_barcode; saving it blank clears the code, which is a
// finished state (a keg usually has none), not missing setup.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { RegistryInput } from "@/components/mgr/views/registry-fields";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function BarcodeForm({ priceGroupId, groupName, formatId, format, upc }: {
  priceGroupId: string; groupName: string; formatId: string; format: string; upc: string;
}) {
  const [value, setValue] = useState(upc);
  const form = useCommandForm("set_price_group_barcode", {
    build: () => ({ priceGroupId, formatId, upc: value || null }),
    reset: () => setValue(upc),
    target: `${priceGroupId}:${formatId}`,
  });
  return E.row(`UPC · ${format}`, upc || "none",
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={`${groupName} · ${format}`}
      trigger={<Button variant="outline" size="sm">{upc ? "Edit" : "Add"}<span className="sr-only"> UPC · {format}</span></Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <RegistryInput label="UPC (blank clears it)" value={value} onChange={setValue} />
        <CommandFormMessage error={form.error} />
        <CommandFormFooter><Button type="submit" disabled={form.busy}>{form.submitting ? "Saving…" : "Save UPC"}</Button></CommandFormFooter>
      </form>
    </CommandForm>);
}
