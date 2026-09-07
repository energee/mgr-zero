// app/(app)/locations/location-form.tsx — one CommandForm for both location
// writes: create_location (no id) and update_location (with id). Name and
// kind only; bins are their own list (Program 2).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Kind = "warehouse" | "taproom";

export function LocationForm({ location }: { location?: { id: string; name: string; kind: Kind } }) {
  const [name, setName] = useState(location?.name ?? "");
  const [kind, setKind] = useState<Kind>(location?.kind ?? "warehouse");
  const form = useCommandForm(location ? "update_location" : "create_location", {
    build: () => (location ? { locationId: location.id, name, kind } : { name, kind }),
    reset: () => { setName(location?.name ?? ""); setKind(location?.kind ?? "warehouse"); },
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
          <Label htmlFor="loc-kind">Type</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger id="loc-kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="warehouse">Warehouse</SelectItem>
                <SelectItem value="taproom">Taproom</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !name.trim()}>{form.submitting ? "Saving…" : location ? "Save location" : "Add location"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
