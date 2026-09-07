// app/(app)/inventory/movement-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the record_movement command.
// Picking a location preselects its first bin (list_bins is alphabetical), so the common case is one tap.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

// Staff-facing movement types; sale_removal/taproom_transfer are produced by
// order flows (plan 1B), not entered manually here.
const MOVEMENT_TYPES = [
  "opening_balance", "production_in", "adjustment", "depletion",
  "destruction", "loss", "sample", "festival_removal", "return_in",
] as const;
type MovementType = (typeof MOVEMENT_TYPES)[number];

// Mirrors the DB CHECK (removal_shape): only depletion requires a channel
// among the staff-facing types above. The picker is a plain id field until
// Program 4 Task 2 fetches the brewery's channels (list_sale_channels).
const requiresChannel = (type: MovementType) => type === "depletion";

export function MovementForm({
  skus,
  locations,
  bins,
}: {
  skus: { id: string; label: string }[];
  locations: { id: string; name: string; kind: string }[];
  bins: { id: string; location_id: string; name: string }[];
}) {
  const [skuId, setSkuId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [binId, setBinId] = useState("");
  const [qty, setQty] = useState("");
  const [type, setType] = useState<MovementType>("opening_balance");
  const [saleChannelId, setSaleChannelId] = useState("");
  const [note, setNote] = useState("");
  const form = useCommandForm("record_movement", {
    build: () => ({ skuId, locationId, binId, qty: Number(qty), type, saleChannelId: requiresChannel(type) ? saleChannelId : undefined, note: note || undefined }),
    reset: () => { setSkuId(""); setLocationId(""); setBinId(""); setQty(""); setType("opening_balance"); setSaleChannelId(""); setNote(""); },
  });

  function onTypeChange(next: MovementType) {
    setType(next);
  }

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Record Movement" trigger={<Button>Record Movement</Button>}>
        <form onSubmit={form.submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-sku">SKU</Label>
            <Select value={skuId} onValueChange={setSkuId}>
              <SelectTrigger id="movement-sku">
                <SelectValue placeholder="Select a SKU" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {skus.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-location">Location</Label>
            <Select value={locationId} onValueChange={(v) => { setLocationId(v); setBinId(bins.filter((b) => b.location_id === v)[0]?.id ?? ""); }}>
              <SelectTrigger id="movement-location">
                <SelectValue placeholder="Select a location" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-bin">Bin</Label>
            <NativeSelect
              id="movement-bin"
              className="w-fit"
              value={binId}
              onChange={(e) => setBinId(e.target.value)}
              disabled={!locationId}
            >
              <option value="">Select a bin</option>
              {bins.filter((b) => b.location_id === locationId).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-type">Type</Label>
            <Select value={type} onValueChange={(v) => onTypeChange(v as MovementType)}>
              <SelectTrigger id="movement-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {MOVEMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {requiresChannel(type) && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="movement-channel">Channel</Label>
              <Input id="movement-channel" value={saleChannelId} onChange={(e) => setSaleChannelId(e.target.value)} required />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-qty">
              Qty <span className="font-normal text-muted-foreground">(positive for inflows, negative for removals)</span>
            </Label>
            <Input id="movement-qty" type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-note">Note</Label>
            <Input id="movement-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <CommandFormMessage error={form.error} />
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting || !skuId || !locationId || !binId}>
              {form.submitting ? "Recording…" : "Record"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
