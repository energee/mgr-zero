// app/(app)/locations/location-form.tsx — one CommandForm for both location
// writes: create_location (no id) and update_location (with id). Name and
// uses only — a place can be several at once; bins are their own list (Program 2).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BRIGHT_ON } from "@/components/mgr/e";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Kind = "warehouse" | "taproom" | "storage";
const KINDS: [Kind, string][] = [["warehouse", "Warehouse"], ["taproom", "Taproom"], ["storage", "Storage"]];

export function LocationForm({ location }: { location?: { id: string; name: string; uses: Kind[] } }) {
  const [name, setName] = useState(location?.name ?? "");
  const [uses, setUses] = useState<Kind[]>(location?.uses ?? ["warehouse"]);
  const form = useCommandForm(location ? "update_location" : "create_location", {
    build: () => (location ? { locationId: location.id, name, uses } : { name, uses }),
    reset: () => { setName(location?.name ?? ""); setUses(location?.uses ?? ["warehouse"]); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={location ? "Edit location" : "Add location"}
      trigger={<Button size="sm" variant={location ? "outline" : "default"}>{location ? "Edit" : "Add location"}</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="loc-name">Location name</Label>
          <Input id="loc-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="loc-uses">Uses</Label>
          <ToggleGroup id="loc-uses" type="multiple" variant="outline" size="sm" aria-label="Uses"
            value={uses} onValueChange={(v) => setUses(v as Kind[])} className="flex-wrap justify-start">
            {KINDS.map(([value, label]) => <ToggleGroupItem key={value} value={value} className={BRIGHT_ON}>{label}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !name.trim() || uses.length === 0}>{form.submitting ? "Saving…" : location ? "Save location" : "Add location"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
