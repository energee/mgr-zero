// app/(app)/kegs/event-form.tsx — live command adapter for Record keg event:
// it supplies the existing query options, payload, recovery, and the shared
// complete event presentation. Keg fleet opens it blank; Customer keg balance
// opens it as Record return, prefilled from the row (`prefill`, `label`).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { KegEventPresentation } from "@/components/mgr/views/keg-event-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { KEG_EVENT_REASONS } from "@/lib/mgr/enums";
import { mayHaveKegCustomer, toKegOption as toOption, withLocationBin, type KegEventValue } from "@/lib/mgr/keg-fleet-view";

export function KegEventForm({ pools, locations, bins, customers, prefill, label = "Record keg event" }: {
  pools: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  bins: { id: string; location_id: string; name: string }[];
  customers: { id: string; name: string }[];
  /** Values the form opens with, over the blank defaults. */
  prefill?: Partial<KegEventValue>;
  /** The trigger's verb. */
  label?: string;
}) {
  const initial = (): KegEventValue => ({ poolId: pools[0]?.id ?? "", kegSize: "half_bbl", reason: KEG_EVENT_REASONS[0], locationId: "", binId: "", customerId: "", qty: "", note: "", ...prefill });
  const [value, setValue] = useState(initial);
  const binsAt = (locationId: string) => bins.filter((b) => b.location_id === locationId);
  // Choosing a location preselects its first bin.
  const change = (next: KegEventValue) => setValue(withLocationBin(value, next, (locationId) => binsAt(locationId)[0]?.id ?? ""));
  const form = useCommandForm("record_keg_event", {
    build: () => ({
      poolId: value.poolId, kegSize: value.kegSize, reason: value.reason, locationId: value.locationId, binId: value.binId, qty: Number(value.qty),
      customerId: mayHaveKegCustomer(value.reason) && value.customerId ? value.customerId : undefined, note: value.note || undefined,
    }),
    reset: () => setValue(initial()),
  });
  return (
    <KegEventPresentation open={form.open} onOpenChange={form.setOpen} trigger={<Button data-preview-action size="sm">{label}</Button>}
      value={value} options={{ pools: pools.map(toOption), locations: locations.map(toOption), bins: binsAt(value.locationId).map(toOption), customers: customers.map(toOption) }}
      onChange={change} onSubmit={form.submit} error={form.error} submitting={form.submitting} />
  );
}
