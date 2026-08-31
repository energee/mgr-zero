// app/(app)/inventory/movement-form.tsx — dialog form for the record_movement command.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBrewery } from "../brewery-provider";
import { command } from "@/lib/commands/client";

// Staff-facing movement types; sale_removal/taproom_transfer are produced by
// order flows (plan 1B), not entered manually here.
const MOVEMENT_TYPES = [
  "opening_balance",
  "production_in",
  "adjustment",
  "depletion",
  "destruction",
  "loss",
  "sample",
  "festival_removal",
  "return_in",
] as const;
type MovementType = (typeof MOVEMENT_TYPES)[number];

const CHANNELS = ["wholesale", "taproom", "dtc", "export"] as const;

// Mirrors the DB CHECK (removal_shape): only depletion requires a channel
// (fixed to taproom) among the staff-facing types above.
function requiresChannel(type: MovementType) {
  return type === "depletion";
}

export function MovementForm({
  skus,
  locations,
}: {
  skus: { id: string; label: string }[];
  locations: { id: string; name: string; kind: string }[];
}) {
  const breweryId = useBrewery();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [skuId, setSkuId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState("");
  const [type, setType] = useState<MovementType>("opening_balance");
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>("taproom");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setSkuId("");
    setLocationId("");
    setQty("");
    setType("opening_balance");
    setChannel("taproom");
    setNote("");
    setError(null);
  }

  function onTypeChange(next: MovementType) {
    setType(next);
    if (next === "depletion") setChannel("taproom");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await command(breweryId, "record_movement", {
        skuId,
        locationId,
        qty: Number(qty),
        type,
        channel: requiresChannel(type) ? channel : undefined,
        note: note || undefined,
      });
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to record movement");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>Record Movement</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Movement</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-sku">SKU</Label>
            <Select value={skuId} onValueChange={setSkuId}>
              <SelectTrigger id="movement-sku">
                <SelectValue placeholder="Select a SKU" />
              </SelectTrigger>
              <SelectContent>
                {skus.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
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
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
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
                {MOVEMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
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
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting || !skuId || !locationId}>
              {submitting ? "Recording…" : "Record"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
