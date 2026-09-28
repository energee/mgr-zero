"use client";

// Portal fulfillment warehouse picker shared by the Settings inventory frame and
// the live form; live passes onSave/busy/error, the fixture passes none.

import { useState } from "react";
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
  return <form className="flex flex-col gap-4" onSubmit={event => { event.preventDefault(); onSave?.(locationId); }}>
    {E.pick("Portal fulfillment warehouse", locationId, [{ value: "", label: "Choose warehouse", disabled: true }, ...locations.map(location => ({ value: location.id, label: location.name }))], { id: "portal-warehouse", required: true, disabled: busy || !locations.length, onChange: setLocationId })}
    {!locations.length && E.nav("Locations", "Add a warehouse before enabling portal orders.", "", undefined, locationsHref)}
    <CommandFormMessage error={error} />
    <Button variant="outline" disabled={busy || !locationId}>{busy ? "Saving…" : "Save warehouse"}</Button>
  </form>;
}
