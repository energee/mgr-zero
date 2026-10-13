// app/(app)/catalog/sku-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the create_sku and
// update_sku commands: one brand (given) × one packaged format (picked). Both forms mount the shared SkuView;
// only the command wiring, the optional Name input and the footers live here.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { SkuView } from "@/components/mgr/views/sku";
import { RegistryInput } from "@/components/mgr/views/registry-fields";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { toSkuViewProps, skuCreateCommand, type KegPoolOption } from "@/lib/mgr/sku-view";

export type FormatOption = { id: string; name: string; package_type?: string | null };

export function SkuForm({ brandId, formats, pools = [] }: { brandId: string; formats: FormatOption[]; pools?: KegPoolOption[] }) {
  const [formatId, setFormatId] = useState(formats[0]?.id ?? "");
  const [kegPool, setKegPool] = useState("");
  const [name, setName] = useState("");
  const [upc, setUpc] = useState("");
  const selectedFormat = formats.find(f => f.id === formatId);
  const creation = skuCreateCommand({ brandId, formatId, name, upc, kegPoolId: selectedFormat?.package_type === "keg" ? kegPool || null : null });
  const form = useCommandForm(creation.name, {
    build: () => creation.input,
    reset: () => { setFormatId(formats[0]?.id ?? ""); setName(""); setUpc(""); setKegPool(""); },
  });
  // The view picks by format name; ids stay here because create_sku takes one.
  const formatName = selectedFormat?.name ?? "";

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New SKU" trigger={<Button variant="outline" size="sm">New SKU</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <SkuView
          model={{ ...toSkuViewProps({ formats: selectedFormat ? [selectedFormat] : [], pools }), formatOptions: formats.map(f => f.name), format: formatName, upc, kegPool }}
          controls={{ format: (value) => { const next = formats.find(f => f.name === value); setFormatId(next?.id ?? ""); if (next?.package_type !== "keg") setKegPool(""); }, upc: setUpc, kegPool: setKegPool }}
          // create_sku has no active flag; a new SKU is active.
          activeRow={null}
          fields={<RegistryInput label="Name (optional)" value={name} onChange={setName} placeholder="Brand · Format" />}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !creation.valid}>{form.submitting ? "Creating…" : "Create"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}

// Only mutable SKU facts are sent; changing its package means creating another SKU.
export function SkuEditForm({ sku, formatName, packageType, pools = [] }: { sku: { id: string; name: string; active: boolean; upc: string | null; keg_pool_id?: string | null }; formatName: string; packageType?: string | null; pools?: KegPoolOption[] }) {
  const [kegPool, setKegPool] = useState(sku.keg_pool_id ?? "");
  const [active, setActive] = useState(sku.active);
  const [upc, setUpc] = useState(sku.upc ?? "");
  const reset = () => { setActive(sku.active); setUpc(sku.upc ?? ""); setKegPool(sku.keg_pool_id ?? ""); };
  const form = useCommandForm("update_sku", {
    build: () => ({ skuId: sku.id, active, upc, ...(packageType === "keg" && kegPool !== (sku.keg_pool_id ?? "") ? { kegPoolId: kegPool || null } : {}) }), reset,
  });
  return (
    <CommandForm open={form.open} onOpenChange={(open) => { if (open) reset(); form.setOpen(open); }} title={`Edit SKU · ${sku.name}`} trigger={<Button variant="outline" size="sm">Edit SKU</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <SkuView
          // A saved SKU keeps its format, so the picker has no options to offer.
          model={{ ...toSkuViewProps({ formats: [], pools, sku: { ...sku, format_id: "", formats: { name: formatName, package_type: packageType } } }), format: formatName, active, upc, kegPool }}
          controls={{ active: setActive, upc: setUpc, kegPool: setKegPool }}
          locked
          messages={<>
            <p className="text-sm">Create another SKU to use a different format. Changing the keg pool affects future orders only.</p>
            <p className="text-sm text-muted-foreground">Inactive SKUs leave inventory and order history intact and cannot be added to new orders. Clear UPC to remove it.</p>
            <CommandFormMessage error={form.error} />
          </>}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting}>{form.submitting ? "Saving…" : "Save SKU"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
