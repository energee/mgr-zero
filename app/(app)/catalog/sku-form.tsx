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
import { toSkuViewProps, skuCreateCommand } from "@/lib/mgr/sku-view";

export type FormatOption = { id: string; name: string };

export function SkuForm({ brandId, formats }: { brandId: string; formats: FormatOption[] }) {
  const [kind, setKind] = useState<"packaged" | "poured">("packaged");
  const [pourName, setPourName] = useState("");
  const [ounces, setOunces] = useState("");
  const [formatId, setFormatId] = useState(formats[0]?.id ?? "");
  const [name, setName] = useState("");
  const [upc, setUpc] = useState("");
  const creation = skuCreateCommand({ kind, brandId, formatId, name, upc, pourName, ounces });
  const form = useCommandForm(creation.name, {
    build: () => creation.input,
    reset: () => { setKind("packaged"); setPourName(""); setOunces(""); setFormatId(formats[0]?.id ?? ""); setName(""); setUpc(""); },
  });
  // The view picks by format name; ids stay here because create_sku takes one.
  const formatName = formats.find((f) => f.id === formatId)?.name ?? "";

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New SKU" trigger={<Button variant="outline" size="sm">New SKU</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <SkuView
          model={{ ...toSkuViewProps({ formats }), format: formatName, upc, kind, pourName, ounces }}
          controls={{ kind: setKind, pourName: setPourName, ounces: setOunces, format: (value) => setFormatId(formats.find((f) => f.name === value)?.id ?? ""), upc: setUpc }}
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
export function SkuEditForm({ sku, formatName }: { sku: { id: string; name: string; active: boolean; upc: string | null }; formatName: string }) {
  const [active, setActive] = useState(sku.active);
  const [upc, setUpc] = useState(sku.upc ?? "");
  const reset = () => { setActive(sku.active); setUpc(sku.upc ?? ""); };
  const form = useCommandForm("update_sku", {
    build: () => ({ skuId: sku.id, active, upc }), reset,
  });
  return (
    <CommandForm open={form.open} onOpenChange={(open) => { if (open) reset(); form.setOpen(open); }} title={`Edit SKU · ${sku.name}`} trigger={<Button variant="outline" size="sm">Edit SKU</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <SkuView
          // A saved SKU keeps its format, so the picker has no options to offer.
          model={{ ...toSkuViewProps({ formats: [] }), format: formatName, active, upc }}
          controls={{ active: setActive, upc: setUpc }}
          locked
          messages={<>
            <p className="text-sm">Create another SKU to use a different format.</p>
            <p className="text-sm text-muted-foreground">Inactive SKUs leave inventory and order history intact and cannot be added to new orders. Clear UPC to remove it.</p>
            <CommandFormMessage error={form.error} />
          </>}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting}>{form.submitting ? "Saving…" : "Save SKU"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
