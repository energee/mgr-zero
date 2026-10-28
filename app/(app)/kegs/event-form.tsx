// app/(app)/kegs/event-form.tsx — live command adapter for Record keg event:
// it supplies the existing query options, payload, recovery, and the shared
// complete event presentation. `autoOpen` opens it for ?recordEvent=1.
// Customer keg balance prefills Record return from its row (`prefill`, `label`).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { KegEventPresentation } from "@/components/mgr/views/keg-event-form";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { KEG_EVENT_REASONS } from "@/lib/mgr/enums";
import { kegOnHand, mayHaveKegCustomer, toKegOption as toOption, withLocationBin, type KegEventValue } from "@/lib/mgr/keg-fleet-view";

export function KegEventForm({ pools, locations, bins, customers, stock, balances, prefill, label = "Record keg event", autoOpen = false }: {
  pools: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  bins: { id: string; location_id: string; name: string }[];
  customers: { id: string; name: string }[];
  autoOpen?: boolean;
  /** Values the form opens with, over the blank defaults. */
  prefill?: Partial<KegEventValue>;
  /** The trigger's verb. */
  label?: string;
  /** get_keg_fleet's kegs on hand per pool, size and bin, so a count leaving the bin is held to what it holds. */
  stock: { pool_id: string; keg_size: string; bin_id: string; qty: number }[];
  /** get_keg_fleet's kegs each customer holds per pool and size, so a return or a loss at a customer is held to what it holds. */
  balances: { customer_id: string; pool_id: string; keg_size: string; qty: number }[];
}) {
  const initial = (): KegEventValue => ({ poolId: pools[0]?.id ?? "", kegSize: "half_bbl", reason: KEG_EVENT_REASONS[0], locationId: "", binId: "", customerId: "", qty: "", note: "", ...prefill });
  const [value, setValue] = useState(initial);
  const binsAt = (locationId: string) => bins.filter((b) => b.location_id === locationId);
  const onHand = kegOnHand(value, stock, balances);
  // Choosing a location preselects its first bin.
  const change = (next: KegEventValue) => setValue(withLocationBin(value, next, (locationId) => binsAt(locationId)[0]?.id ?? ""));
  const form = useCommandForm("record_keg_event", {
    defaultOpen: autoOpen,
    build: () => ({
      poolId: value.poolId, kegSize: value.kegSize, reason: value.reason, locationId: value.locationId, binId: value.binId, qty: Number(value.qty),
      customerId: mayHaveKegCustomer(value.reason) && value.customerId ? value.customerId : undefined, note: value.note || undefined,
    }),
    reset: () => setValue(initial()),
  });
  return (
    <KegEventPresentation open={form.open} onOpenChange={form.setOpen} trigger={<Button data-preview-action size="sm">{label}</Button>}
      value={value} options={{ pools: pools.map(toOption), locations: locations.map(toOption), bins: binsAt(value.locationId).map(toOption), customers: customers.map(toOption), onHand }}
      onChange={change} onSubmit={form.submit} error={form.error} submitting={form.submitting} />
  );
}
