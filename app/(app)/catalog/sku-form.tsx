// app/(app)/catalog/sku-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the create_sku command:
// one brand (given) × one packaged format (picked). Name and UPC are optional; the name defaults to "Brand · Format".
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

export type FormatOption = { id: string; name: string };

export function SkuForm({ brandId, formats }: { brandId: string; formats: FormatOption[] }) {
  const [formatId, setFormatId] = useState(formats[0]?.id ?? "");
  const [name, setName] = useState("");
  const [upc, setUpc] = useState("");
  const form = useCommandForm("create_sku", {
    build: () => ({ brandId, formatId, name: name || undefined, upc: upc || undefined }),
    reset: () => { setFormatId(formats[0]?.id ?? ""); setName(""); setUpc(""); },
  });

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New SKU" trigger={<Button variant="outline" size="sm">New SKU</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sku-format">Format</Label>
          <Select value={formatId} onValueChange={setFormatId} required>
            <SelectTrigger id="sku-format"><SelectValue placeholder="Add a packaged format first" /></SelectTrigger>
            <SelectContent>{formats.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sku-name">Name (optional)</Label>
          <Input id="sku-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Brand · Format" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sku-upc">UPC (optional)</Label>
          <Input id="sku-upc" value={upc} onChange={(e) => setUpc(e.target.value)} />
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !formatId}>
            {form.submitting ? "Creating…" : "Create"}
          </Button>
        </CommandFormFooter>
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
        <p className="text-sm">Format: {formatName}. Create another SKU to use a different format.</p>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Active · available to sell</label>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`sku-upc-${sku.id}`}>UPC (optional)</Label>
          <Input id={`sku-upc-${sku.id}`} value={upc} onChange={(e) => setUpc(e.target.value)} />
        </div>
        <p className="text-sm text-muted-foreground">Inactive SKUs leave inventory and order history intact and cannot be added to new orders. Clear UPC to remove it.</p>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter><Button type="submit" disabled={form.submitting}>{form.submitting ? "Saving…" : "Save SKU"}</Button></CommandFormFooter>
      </form>
    </CommandForm>
  );
}
