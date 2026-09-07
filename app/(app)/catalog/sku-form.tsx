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
