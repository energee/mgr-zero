// app/(app)/catalog/brand-form.tsx — CommandForm (bottom sheet on phone, dialog
// on desk) for the upsert_brand command (create only from here). Price group is
// a select over the brewery’s price groups (the rows of the price grid): the
// brand sits on one, and every SKU of it is priced by that row’s cells.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useCommandForm } from "@/lib/commands/use-command-form";

const EMPTY = { name: "", style: "", abv: "", description: "", category: "", priceGroupId: "", hops: "" };
type Fields = typeof EMPTY;

// Closes over nothing, so it lives outside the component.
function field(id: string, label: string, value: string, set: (v: string) => void, props: React.ComponentProps<typeof Input> = {}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => set(e.target.value)} {...props} />
    </div>
  );
}

export function BrandForm({ groups }: { groups: { id: string; name: string }[] }) {
  const [f, setF] = useState<Fields>(EMPTY);
  const set = (k: keyof Fields) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const form = useCommandForm("upsert_brand", {
    // Every optional field is sent only when filled; ABV is the one number.
    build: () => ({
      name: f.name, style: f.style || undefined, abv: f.abv ? Number(f.abv) : undefined,
      description: f.description || undefined, category: f.category || undefined,
      priceGroupId: f.priceGroupId || undefined, hops: f.hops || undefined,
    }),
    reset: () => setF(EMPTY),
  });

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New Brand" trigger={<Button>New Brand</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        {field("brand-name", "Name", f.name, set("name"), { required: true })}
        {field("brand-style", "Style", f.style, set("style"))}
        {field("brand-abv", "ABV", f.abv, set("abv"), { type: "number", step: "0.01" })}
        {field("brand-description", "Description", f.description, set("description"))}
        {field("brand-category", "Category", f.category, set("category"))}
        <div className="flex flex-col gap-2">
          <Label htmlFor="brand-price-group">Price group</Label>
          <NativeSelect id="brand-price-group" value={f.priceGroupId} onChange={(e) => set("priceGroupId")(e.target.value)}>
            <option value="">Unpriced</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </NativeSelect>
        </div>
        {field("brand-hops", "Hops", f.hops, set("hops"))}
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting}>
            {form.submitting ? "Creating…" : "Create"}
          </Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
