// app/(app)/catalog/sku-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the create_sku and
// update_sku commands: one brand (given) × one packaged format (picked). Both forms mount the shared SkuView;
// only the command wiring, the optional Name input and the footers live here.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { SkuView } from "@/components/mgr/views/sku";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCommandForm } from "@/lib/commands/use-command-form";

export type FormatOption = { id: string; name: string };

const VOLUME_INFO = "Volume and packaging come from the Format. Create another Format when either differs.";

export function SkuForm({ brandId, formats }: { brandId: string; formats: FormatOption[] }) {
  const [formatId, setFormatId] = useState(formats[0]?.id ?? "");
  const [name, setName] = useState("");
  const [upc, setUpc] = useState("");
  const form = useCommandForm("create_sku", {
    build: () => ({ brandId, formatId, name: name || undefined, upc: upc || undefined }),
    reset: () => { setFormatId(formats[0]?.id ?? ""); setName(""); setUpc(""); },
  });
  // The view picks by format name; ids stay here because create_sku takes one.
  const formatName = formats.find((f) => f.id === formatId)?.name ?? "";

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New SKU" trigger={<Button variant="outline" size="sm">New SKU</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <SkuView
          model={{ format: formatName, formatOptions: formats.map((f) => f.name), active: true, upc, volumeInfo: VOLUME_INFO }}
          controls={{ format: (value) => setFormatId(formats.find((f) => f.name === value)?.id ?? ""), upc: setUpc }}
          // create_sku has no active flag; a new SKU is active.
          activeRow={null}
          fields={<Field><FieldLabel>Name (optional)</FieldLabel><Input aria-label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="Brand · Format" /></Field>}
          messages={<CommandFormMessage error={form.error} />}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting || !formatId}>{form.submitting ? "Creating…" : "Create"}</Button></CommandFormFooter>}
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
          model={{ format: formatName, formatOptions: [formatName], active, upc, volumeInfo: VOLUME_INFO }}
          controls={{ active: setActive, upc: setUpc }}
          locked
          messages={<>
            <p className="text-sm">Format: {formatName}. Create another SKU to use a different format.</p>
            <p className="text-sm text-muted-foreground">Inactive SKUs leave inventory and order history intact and cannot be added to new orders. Clear UPC to remove it.</p>
            <CommandFormMessage error={form.error} />
          </>}
          footer={<CommandFormFooter><Button type="submit" disabled={form.submitting}>{form.submitting ? "Saving…" : "Save SKU"}</Button></CommandFormFooter>}
        />
      </form>
    </CommandForm>
  );
}
