// app/(app)/catalog/brand-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the upsert_brand command (create only from here).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function BrandForm() {
  const [name, setName] = useState("");
  const [style, setStyle] = useState("");
  const [abv, setAbv] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [priceGroup, setPriceGroup] = useState("");
  const [hops, setHops] = useState("");
  const form = useCommandForm("upsert_brand", {
    build: () => ({
      name, style: style || undefined, abv: abv ? Number(abv) : undefined,
      description: description || undefined, category: category || undefined, priceGroup: priceGroup || undefined, hops: hops || undefined,
    }),
    reset: () => { setName(""); setStyle(""); setAbv(""); setDescription(""); setCategory(""); setPriceGroup(""); setHops(""); },
  });

  const field = (id: string, label: string, value: string, set: (v: string) => void, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => set(e.target.value)} {...props} />
    </div>
  );

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New Brand" trigger={<Button>New Brand</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        {field("brand-name", "Name", name, setName, { required: true })}
        {field("brand-style", "Style", style, setStyle)}
        {field("brand-abv", "ABV", abv, setAbv, { type: "number", step: "0.01" })}
        {field("brand-description", "Description", description, setDescription)}
        {field("brand-category", "Category", category, setCategory)}
        {field("brand-price-group", "Price group", priceGroup, setPriceGroup)}
        {field("brand-hops", "Hops", hops, setHops)}
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
