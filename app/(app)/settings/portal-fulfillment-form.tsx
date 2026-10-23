"use client";

import { PortalFulfillmentView } from "@/components/mgr/views/portal-fulfillment";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toast } from "sonner";

/** `locationsHref` is Locations only for a viewer who may edit a location's uses (update_location). */
export function PortalFulfillmentForm({ locations, currentId, locationsHref }: { locations: { id: string; name: string }[]; currentId: string | null; locationsHref: string | null }) {
  const { busy, error, run } = useCommandAction();
  return <PortalFulfillmentView locations={locations} currentId={currentId} busy={busy} error={error} locationsHref={locationsHref}
    onSave={async locationId => { if (await run("set_portal_fulfillment_source", { locationId })) toast.success("Fulfillment warehouse updated"); }} />;
}
