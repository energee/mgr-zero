"use client";

import { PortalFulfillmentView } from "@/components/mgr/views/portal-fulfillment";
import { useCommandAction } from "@/lib/commands/use-command-form";
import { toast } from "sonner";

export function PortalFulfillmentForm({ locations, currentId }: { locations: { id: string; name: string }[]; currentId: string | null }) {
  const { busy, error, run } = useCommandAction();
  return <PortalFulfillmentView locations={locations} currentId={currentId} busy={busy} error={error} locationsHref="/locations"
    onSave={async locationId => { if (await run("set_portal_fulfillment_source", { locationId })) toast.success("Fulfillment warehouse updated"); }} />;
}
