// app/(app)/kegs/event-form.tsx — CommandForm for record_keg_event: pool,
// size, reason, location and bin (first bin preselected), quantity, and a
// customer when the reason is shipped or returned. Empty kegs only: beer
// coming back with a keg is Return shipment.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";
import { KEG_EVENT_REASONS, KEG_SIZES } from "@/lib/commands/taproom";
import { REASON_LABEL, SIZE_LABEL } from "./keg-labels";

type Reason = (typeof KEG_EVENT_REASONS)[number];
const needsCustomer = (r: Reason) => r === "shipped" || r === "returned";
const mayHaveCustomer = (r: Reason) => needsCustomer(r) || r === "lost" || r === "found";

function Pick<T extends string>({ id, label, value, onChange, options, disabled, placeholder }: {
  id: string; label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; disabled?: boolean; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
        <SelectTrigger id={id}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function KegEventForm({ pools, locations, bins, customers }: {
  pools: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  bins: { id: string; location_id: string; name: string }[];
  customers: { id: string; name: string }[];
}) {
  const [poolId, setPoolId] = useState(pools[0]?.id ?? "");
  const [kegSize, setKegSize] = useState<(typeof KEG_SIZES)[number]>("half_bbl");
  const [reason, setReason] = useState<Reason>("acquired");
  const [locationId, setLocationId] = useState("");
  const [binId, setBinId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const form = useCommandForm("record_keg_event", {
    build: () => ({
      poolId, kegSize, reason, locationId, binId, qty: Number(qty),
      customerId: mayHaveCustomer(reason) && customerId ? customerId : undefined, note: note || undefined,
    }),
    reset: () => { setPoolId(pools[0]?.id ?? ""); setKegSize("half_bbl"); setReason("acquired"); setLocationId(""); setBinId(""); setCustomerId(""); setQty(""); setNote(""); },
  });
  const ready = poolId && locationId && binId && Number(qty) > 0 && (!needsCustomer(reason) || customerId);
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Record keg event" trigger={<Button size="sm">Record keg event</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <Pick id="keg-pool" label="Keg pool" value={poolId} onChange={setPoolId} options={pools.map((p) => ({ value: p.id, label: p.name }))} placeholder="Select a pool" />
        <Pick id="keg-size" label="Size" value={kegSize} onChange={setKegSize} options={KEG_SIZES.map((s) => ({ value: s, label: SIZE_LABEL[s] }))} />
        <Pick id="keg-reason" label="Reason" value={reason} onChange={setReason} options={KEG_EVENT_REASONS.map((r) => ({ value: r, label: REASON_LABEL[r] }))} />
        <Pick id="keg-location" label={reason === "shipped" ? "Shipped from" : reason === "returned" ? "Returned to" : "Location"} value={locationId}
          onChange={(v) => { setLocationId(v); setBinId(bins.filter((b) => b.location_id === v)[0]?.id ?? ""); }}
          options={locations.map((l) => ({ value: l.id, label: l.name }))} placeholder="Select a location" />
        <Pick id="keg-bin" label="Bin" value={binId} onChange={setBinId} disabled={!locationId}
          options={bins.filter((b) => b.location_id === locationId).map((b) => ({ value: b.id, label: b.name }))} placeholder="Select a bin" />
        {mayHaveCustomer(reason) && (
          <Pick id="keg-customer" label={needsCustomer(reason) ? "Customer" : "Customer (optional)"} value={customerId} onChange={setCustomerId}
            options={customers.map((c) => ({ value: c.id, label: c.name }))} placeholder="Select a customer" />
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="keg-qty">Kegs</Label>
          <Input id="keg-qty" type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="keg-note">Note</Label>
          <Input id="keg-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">Empty kegs only. Beer coming back with a keg, and its credit, is Return shipment.</p>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Recording…" : "Record"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
