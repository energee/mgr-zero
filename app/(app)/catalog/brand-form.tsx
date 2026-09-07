// app/(app)/catalog/brand-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the upsert_brand command (create only from here).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";

const EMPTY = { name: "", style: "", abv: "", description: "", category: "", priceGroup: "", hops: "" };
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

export function BrandForm() {
  const [f, setF] = useState<Fields>(EMPTY);
  const set = (k: keyof Fields) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));
  const form = useCommandForm("upsert_brand", {
    // Every optional field is sent only when filled; ABV is the one number.
    build: () => ({
      name: f.name, style: f.style || undefined, abv: f.abv ? Number(f.abv) : undefined,
      description: f.description || undefined, category: f.category || undefined,
      priceGroup: f.priceGroup || undefined, hops: f.hops || undefined,
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
        {field("brand-price-group", "Price group", f.priceGroup, set("priceGroup"))}
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
