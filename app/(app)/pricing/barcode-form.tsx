// app/(app)/pricing/barcode-form.tsx — one price group × format UPC: every SKU
// on the group scans as it for that format, unless the SKU has its own. A sheet
// over set_price_group_barcode; saving it blank clears the code, which is a
// finished state (a keg usually has none), not missing setup. A bad code is
// named under the field once it is left, and withholds Save UPC (upcError).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { submitReason } from "@/lib/mgr/submit-reason";
import { UPC_NEED, upcError } from "@/lib/mgr/upc";

export function BarcodeForm({ priceGroupId, groupName, formatId, format, upc }: {
  priceGroupId: string; groupName: string; formatId: string; format: string; upc: string;
}) {
  const [value, setValue] = useState(upc);
  const [left, setLeft] = useState(false);
  const error = upcError(value);
  const reason = submitReason(error ? [UPC_NEED] : []);
  const form = useCommandForm("set_price_group_barcode", {
    build: () => ({ priceGroupId, formatId, upc: value || null }),
    reset: () => { setValue(upc); setLeft(false); },
    target: `${priceGroupId}:${formatId}`,
  });
  return E.row(`UPC · ${format}`, upc || "none",
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={`${groupName} · ${format}`}
      trigger={<Button variant="outline" size="sm">{upc ? "Edit" : "Add"}<span className="sr-only"> UPC · {format}</span></Button>}>
      <form onSubmit={(event) => { if (reason) { event.preventDefault(); return; } void form.submit(event); }} className="flex flex-col gap-4">
        {E.edit("UPC (blank clears it)", value, "text", undefined, { id: `upc-${priceGroupId}-${formatId}`, onChange: setValue, onBlur: () => setLeft(true), error: left ? error : undefined })}
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>{E.submit("Save UPC", { submitting: form.submitting, disabled: form.busy, reason })}</CommandFormFooter>
      </form>
    </CommandForm>);
}
