// app/(app)/recipes/new-recipe-form.tsx — CommandForm for create_recipe: a
// name, the brand it is meant to brew (optional — identity is required at
// packaging, not here), and a note. Versions are authored on the recipe's
// own page once it exists.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Brand = { id: string; name: string };

export function NewRecipeForm({ brands }: { brands: Brand[] }) {
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [note, setNote] = useState("");
  const form = useCommandForm("create_recipe", {
    build: () => ({ name, brandId: brandId || undefined, note: note || undefined }),
    reset: () => { setName(""); setBrandId(""); setNote(""); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="New recipe" trigger={<Button size="sm">New recipe</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-name">Name</Label>
          <Input id="rec-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-brand">Brand · optional</Label>
          <NativeSelect id="rec-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Not decided</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rec-note">Note · optional</Label>
          <Input id="rec-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !name.trim()}>{form.submitting ? "Saving…" : "Create recipe"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
