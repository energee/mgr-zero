"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { useCommandForm } from "@/lib/commands/use-command-form";

export function PortalFulfillmentForm({ locations, currentId }: { locations: { id: string; name: string }[]; currentId: string | null }) {
  const [locationId, setLocationId] = useState(currentId ?? "");
  const form = useCommandForm("set_portal_fulfillment_source", {
    build: () => ({ locationId }),
    reset: () => setLocationId(currentId ?? ""),
  });
  return <section className="flex flex-col gap-2">
    <h2 className="font-semibold">Portal fulfillment warehouse</h2>
    <p>{locations.find((l) => l.id === currentId)?.name ?? "Not configured"}</p>
    {locations.length ? <CommandForm open={form.open} onOpenChange={form.setOpen} title="Portal fulfillment warehouse" trigger={<Button variant="outline">Change warehouse</Button>}>
      <form className="flex flex-col gap-4" onSubmit={form.submit}>
        <Label htmlFor="portal-warehouse">Warehouse</Label>
        <select id="portal-warehouse" className="rounded-md border p-2" required value={locationId} onChange={(e) => setLocationId(e.target.value)}>
          <option value="" disabled>Choose warehouse</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter><Button type="submit" disabled={form.submitting || !locationId}>{form.submitting ? "Saving…" : "Save warehouse"}</Button></CommandFormFooter>
      </form>
    </CommandForm> : <p>Add a warehouse in <Link className="underline" href="/locations">Locations</Link> before enabling portal orders.</p>}
  </section>;
}
