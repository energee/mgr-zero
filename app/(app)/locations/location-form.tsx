// app/(app)/locations/location-form.tsx — one CommandForm for both location
// writes: create_location (no id) and update_location (with id). It mounts the
// shared LocationFields: name and uses — a place can be several at once; bins
// are their own section on Location detail.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { LocationFields } from "@/components/mgr/views/location";
import { SubmitButton } from "@/components/mgr/submit-button";
import { submitReason } from "@/lib/mgr/submit-reason";
import type { LocationUse } from "@/lib/mgr/enums";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function LocationForm({ location }: { location?: { id: string; name: string; uses: LocationUse[] } }) {
  const [name, setName] = useState(location?.name ?? "");
  const [uses, setUses] = useState<LocationUse[]>(location?.uses ?? []);
  const form = useCommandForm(location ? "update_location" : "create_location", {
    build: () => (location ? { locationId: location.id, name, uses } : { name, uses }),
    reset: () => { setName(location?.name ?? ""); setUses(location?.uses ?? []); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={location ? "Edit location" : "Add location"}
      trigger={<Button size="sm" variant={location ? "outline" : "default"}>{location ? "Edit" : "Add location"}</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <LocationFields name={name} uses={uses} controls={{ name: setName, uses: setUses }} />
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <SubmitButton label={location ? "Save location" : "Add location"} submitting={form.submitting}
            reason={submitReason([!name.trim() ? "a location name" : "", uses.length === 0 ? "at least one use" : ""].filter(Boolean))} />
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
