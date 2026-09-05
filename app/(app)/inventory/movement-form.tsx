// app/(app)/inventory/movement-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the record_movement command.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

// Staff-facing movement types; sale_removal/taproom_transfer are produced by
// order flows (plan 1B), not entered manually here.
const MOVEMENT_TYPES = [
  "opening_balance", "production_in", "adjustment", "depletion",
  "destruction", "loss", "sample", "festival_removal", "return_in",
] as const;
type MovementType = (typeof MOVEMENT_TYPES)[number];

const CHANNELS = ["wholesale", "taproom", "dtc", "export"] as const;

// Mirrors the DB CHECK (removal_shape): only depletion requires a channel
// (fixed to taproom) among the staff-facing types above.
const requiresChannel = (type: MovementType) => type === "depletion";

export function MovementForm({
  skus,
  locations,
}: {
  skus: { id: string; label: string }[];
  locations: { id: string; name: string; kind: string }[];
}) {
  const [skuId, setSkuId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState("");
  const [type, setType] = useState<MovementType>("opening_balance");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("taproom");
  const [note, setNote] = useState("");
  const form = useCommandForm("record_movement", {
    build: () => ({ skuId, locationId, qty: Number(qty), type, channel: requiresChannel(type) ? channel : undefined, note: note || undefined }),
    reset: () => { setSkuId(""); setLocationId(""); setQty(""); setType("opening_balance"); setChannel("taproom"); setNote(""); },
  });

  function onTypeChange(next: MovementType) {
    setType(next);
    if (next === "depletion") setChannel("taproom");
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
            <Select value={locationId} onValueChange={setLocationId}>
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
              <Select value={channel} onValueChange={(v) => setChannel(v as (typeof CHANNELS)[number])}>
                <SelectTrigger id="movement-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {CHANNELS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
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
            <Button type="submit" disabled={form.submitting || !skuId || !locationId}>
              {form.submitting ? "Recording…" : "Record"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
