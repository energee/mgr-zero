// app/(app)/catalog/sku-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for update_sku, opened
// from a Sells as row on the Brand page. It mounts the shared SkuView; only the command wiring and footer live
// here. Creating a SKU is the Sells as switch (lib/mgr/brand-sells-view.ts).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { SkuView } from "@/components/mgr/views/sku";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toSkuViewProps, skuUpdateCommand, type KegPoolOption } from "@/lib/mgr/sku-view";

// Only mutable SKU facts are sent; changing its package means creating another SKU.
export function SkuEditForm({ sku, formatName, packageType, pools = [] }: { sku: { id: string; name: string; active: boolean; upc: string | null; keg_pool_id?: string | null; batch_share: number | string | null }; formatName: string; packageType?: string | null; pools?: KegPoolOption[] }) {
  const initial = toSkuViewProps({ formats: [], pools, sku: { ...sku, format_id: "", formats: { name: formatName, package_type: packageType } } });
  const [kegPool, setKegPool] = useState(sku.keg_pool_id ?? "");
  const [active, setActive] = useState(sku.active);
  const [upc, setUpc] = useState(sku.upc ?? "");
  const [batchSharePercent, setBatchSharePercent] = useState(initial.batchSharePercent ?? "");
  const reset = () => { setActive(sku.active); setUpc(sku.upc ?? ""); setKegPool(sku.keg_pool_id ?? ""); setBatchSharePercent(initial.batchSharePercent ?? ""); };
  const edit = skuUpdateCommand({ skuId: sku.id, active, upc, batchSharePercent, ...(packageType === "keg" && kegPool !== (sku.keg_pool_id ?? "") ? { kegPoolId: kegPool || null } : {}) });
  const form = useCommandForm(edit.name, {
    build: () => edit.input, reset,
  });
  return (
    <CommandForm open={form.open} onOpenChange={(open) => { if (open) reset(); form.setOpen(open); }} title={`Edit SKU · ${sku.name}`} trigger={<Button variant="outline" size="sm">Edit SKU</Button>}>
      <form onSubmit={(event) => { if (edit.reason) { event.preventDefault(); return; } void form.submit(event); }} className="flex flex-col gap-4">
        <SkuView
          // A saved SKU keeps its format, so the picker has no options to offer.
          model={{ ...initial, active, upc, kegPool, batchSharePercent }}
          controls={{ active: setActive, upc: setUpc, kegPool: setKegPool, batchSharePercent: setBatchSharePercent }}
          locked
          messages={<>
            <p className="text-sm">Create another SKU to use a different format. Changing the keg pool affects future orders only.</p>
            <p className="text-sm text-muted-foreground">Inactive SKUs leave inventory and order history intact and cannot be added to new orders. Clear UPC to remove it.</p>
            <CommandFormMessage error={form.error} />
          </>}
          footer={<CommandFormFooter>{E.submit("Save SKU", { submitting: form.submitting, reason: edit.reason })}</CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
