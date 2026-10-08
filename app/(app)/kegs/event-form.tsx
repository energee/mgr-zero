// app/(app)/kegs/event-form.tsx — CommandForm for record_keg_event, drawing
// the shared KegEventFields: pool, size, reason, location and bin (first bin
// preselected), quantity, and a customer when the reason is shipped or
// returned (optional for lost; never for found, which the RPC refuses with a
// customer). Empty kegs only: beer coming back with a keg is Return shipment.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { KegEventFields } from "@/components/mgr/views/keg-fleet";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { KEG_EVENT_REASONS } from "@/lib/mgr/enums";
import { kegEventReady, mayHaveKegCustomer, toKegOption as toOption, type KegEventValue } from "@/lib/mgr/keg-fleet-view";

export function KegEventForm({ pools, locations, bins, customers }: {
  pools: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  bins: { id: string; location_id: string; name: string }[];
  customers: { id: string; name: string }[];
}) {
  const initial = (): KegEventValue => ({ poolId: pools[0]?.id ?? "", kegSize: "half_bbl", reason: KEG_EVENT_REASONS[0], locationId: "", binId: "", customerId: "", qty: "", note: "" });
  const [value, setValue] = useState(initial);
  const binsAt = (locationId: string) => bins.filter((b) => b.location_id === locationId);
  // Choosing a location preselects its first bin.
  const change = (next: KegEventValue) => setValue(next.locationId !== value.locationId ? { ...next, binId: binsAt(next.locationId)[0]?.id ?? "" } : next);
  const form = useCommandForm("record_keg_event", {
    build: () => ({
      poolId: value.poolId, kegSize: value.kegSize, reason: value.reason, locationId: value.locationId, binId: value.binId, qty: Number(value.qty),
      customerId: mayHaveKegCustomer(value.reason) && value.customerId ? value.customerId : undefined, note: value.note || undefined,
    }),
    reset: () => setValue(initial()),
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Record keg event" trigger={<Button size="sm">Record keg event</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <KegEventFields value={value} onChange={change}
          options={{ pools: pools.map(toOption), locations: locations.map(toOption), bins: binsAt(value.locationId).map(toOption), customers: customers.map(toOption) }} />
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !kegEventReady(value)}>{form.submitting ? "Recording…" : "Record keg event"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
