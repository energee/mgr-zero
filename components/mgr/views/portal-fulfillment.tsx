"use client";

import { useState, type FormEvent } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";

export function PortalFulfillmentView({ locations, currentId, onSave, busy = false, error = null, locationsHref }: {
  locations: { id: string; name: string }[];
  currentId: string | null;
  onSave?: (locationId: string) => void;
  busy?: boolean;
  error?: string | null;
  locationsHref?: string;
}) {
  const [locationId, setLocationId] = useState(currentId ?? "");
  const submit = (event: FormEvent) => { event.preventDefault(); onSave?.(locationId); };
  return <form className="flex flex-col gap-4" onSubmit={submit}>
    {E.pick("Portal fulfillment warehouse", locationId, [{ value: "", label: "Choose warehouse" }, ...locations.map(location => ({ value: location.id, label: location.name }))], { id: "portal-warehouse", required: true, disabled: busy || !locations.length, onChange: setLocationId })}
    {!locations.length && E.nav("Locations", "Add a warehouse before enabling portal orders.", "", undefined, locationsHref)}
    <CommandFormMessage error={error} />
    <Button variant="outline" disabled={busy || !locationId}>{busy ? "Saving…" : "Save warehouse"}</Button>
  </form>;
}
