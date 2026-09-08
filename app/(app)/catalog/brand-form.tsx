// app/(app)/catalog/brand-form.tsx — CommandForm (bottom sheet on phone, dialog
// on desk) for the upsert_brand command (create and edit). Price group is
// a select over the brewery’s price groups (the rows of the price grid): the
// brand sits on one, and every SKU of it is priced by that row’s cells.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";


export type BrandValues = { id: string; name: string; style: string | null; abv: number | null; description: string | null; category: string | null; priceGroupId: string | null; hops: string | null };

// Closes over nothing, so it lives outside the component.
function field(id: string, label: string, value: string, set: (v: string) => void, props: React.ComponentProps<typeof Input> = {}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => set(e.target.value)} {...props} />
    </div>
  );
}

export function BrandForm({ groups, brand }: { groups: { id: string; name: string }[]; brand?: BrandValues }) {
  const initial = { name: brand?.name ?? "", style: brand?.style ?? "", abv: brand?.abv == null ? "" : String(brand.abv), description: brand?.description ?? "", category: brand?.category ?? "", priceGroupId: brand?.priceGroupId ?? "", hops: brand?.hops ?? "" };
  const [f, setF] = useState(initial);
  const set = (k: keyof typeof initial) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const form = useCommandForm("upsert_brand", {
    // Every optional field is sent only when filled; ABV is the one number.
    build: () => ({
      id: brand?.id, name: f.name, style: f.style || undefined, abv: f.abv ? Number(f.abv) : undefined,
      description: f.description || undefined, category: f.category || undefined,
      priceGroupId: f.priceGroupId || undefined, hops: f.hops || undefined,
    }),
    reset: () => setF(initial),
  });

  return (
    <CommandForm open={form.open} onOpenChange={(open) => { if (open) setF(initial); form.setOpen(open); }} title={brand ? "Edit brand" : "New Brand"} trigger={<Button variant={brand ? "outline" : "default"} size={brand ? "sm" : "default"}>{brand ? "Edit brand" : "New Brand"}</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        {field("brand-name", "Name", f.name, set("name"), { required: true })}
        {field("brand-style", "Style", f.style, set("style"))}
        {field("brand-abv", "ABV", f.abv, set("abv"), { type: "number", step: "0.01" })}
        {field("brand-description", "Description", f.description, set("description"))}
        {field("brand-category", "Category", f.category, set("category"))}
        <div className="flex flex-col gap-2">
          <Label htmlFor="brand-price-group">Price group</Label>
          <Select value={f.priceGroupId || NONE} onValueChange={(v) => set("priceGroupId")(v === NONE ? "" : v)}>
            <SelectTrigger id="brand-price-group"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Unpriced</SelectItem>
              {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {field("brand-hops", "Hops", f.hops, set("hops"))}
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting}>
            {form.submitting ? "Saving…" : brand ? "Save brand" : "Create"}
          </Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
