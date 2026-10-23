// app/(app)/locations/location-form.tsx — one CommandForm for both location
// writes: create_location (no id) and update_location (with id). It mounts the
// shared LocationFields: name and uses — a place can be several at once; bins
// are their own list (Location bins).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { LocationFields } from "@/components/mgr/views/location";
import type { LocationUse } from "@/lib/mgr/enums";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function LocationForm({ location }: { location?: { id: string; name: string; uses: LocationUse[] } }) {
  const [name, setName] = useState(location?.name ?? "");
  const [uses, setUses] = useState<LocationUse[]>(location?.uses ?? ["warehouse"]);
  const form = useCommandForm(location ? "update_location" : "create_location", {
    build: () => (location ? { locationId: location.id, name, uses } : { name, uses }),
    reset: () => { setName(location?.name ?? ""); setUses(location?.uses ?? ["warehouse"]); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={location ? "Edit location" : "Add location"}
      trigger={<Button size="sm" variant={location ? "outline" : "default"}>{location ? "Edit" : "Add location"}</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <LocationFields name={name} uses={uses} controls={{ name: setName, uses: setUses }} />
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !name.trim() || uses.length === 0}>{form.submitting ? "Saving…" : location ? "Save location" : "Add location"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
