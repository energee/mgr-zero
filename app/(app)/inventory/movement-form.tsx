// app/(app)/inventory/movement-form.tsx — CommandForm (bottom sheet on phone, dialog on desk) for the record_movement command.
// Picking a location preselects its first bin (list_bins is alphabetical), so the common case is one tap.
"use client";

import { movementFields } from "@/lib/movement-form";
import { formatVolume } from "@/lib/volume";
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

// Mirrors the DB CHECK (removal_shape): sale_removal and depletion each name a
// channel, and only depletion is staff-facing here (sale_removal comes from
// shipping). The channels are the brewery's own rows, read by list_sale_channels.
const requiresChannel = (type: MovementType) => type === "depletion";

export function MovementForm({
  skus,
  locations,
  bins,
  channels,
}: {
  skus: { id: string; label: string; bblPerUnit: number | null }[];
  locations: { id: string; name: string; kind: string }[];
  bins: { id: string; location_id: string; name: string }[];
  channels: { id: string; name: string }[];
}) {
  const [skuId, setSkuId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [binId, setBinId] = useState("");
  const [qty, setQty] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [destState, setDestState] = useState("");
  const [type, setType] = useState<MovementType>("opening_balance");
  // A hand-entered movement is a taproom event far more often than not, so
  // Taproom is preselected when the brewery still has that seeded channel.
  const defaultChannelId = (channels.find((c) => c.name === "Taproom") ?? channels[0])?.id ?? "";
  const [saleChannelId, setSaleChannelId] = useState(defaultChannelId);
  const [note, setNote] = useState("");
  const form = useCommandForm("record_movement", {
    build: () => ({ skuId, locationId, binId, ...movementFields(type, qty, direction, destState, saleChannelId), type, note: note || undefined }),
    reset: () => { setSkuId(""); setLocationId(""); setBinId(""); setQty(""); setType("opening_balance"); setSaleChannelId(defaultChannelId); setNote(""); setDestState(""); setDirection("add"); },
  });

  let fields: ReturnType<typeof movementFields> | null = null;
  try { fields = movementFields(type, qty, direction, destState, saleChannelId); } catch { /* Incomplete inputs disable submission. */ }
  const unitVolume = skus.find(s => s.id === skuId)?.bblPerUnit;

  function onTypeChange(next: MovementType) {
    setType(next);
  }

  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Record Movement" trigger={<Button>Record Movement</Button>}>
        <form onSubmit={e => { if (!fields) { e.preventDefault(); return; } void form.submit(e); }} className="flex flex-col gap-4">
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
            <Select value={binId} onValueChange={setBinId} disabled={!locationId}>
              <SelectTrigger id="movement-bin"><SelectValue placeholder="Select a bin" /></SelectTrigger>
              <SelectContent>
                {bins.filter((b) => b.location_id === locationId).map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
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
              <Select value={saleChannelId} onValueChange={setSaleChannelId} required>
                <SelectTrigger id="movement-channel"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(type === "sample" || type === "festival_removal") && <div className="flex flex-col gap-2">
            <Label htmlFor="movement-state">Destination state</Label>
            <Input id="movement-state" value={destState} onChange={e => setDestState(e.target.value.toUpperCase())} required pattern="[A-Za-z]{2}" maxLength={2} placeholder="PA" />
          </div>}
          {type === "adjustment" && <div className="flex flex-col gap-2">
            <Label htmlFor="movement-direction">Direction</Label>
            <Select value={direction} onValueChange={v => setDirection(v as "add" | "remove")}>
              <SelectTrigger id="movement-direction"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="add">Add stock</SelectItem><SelectItem value="remove">Remove stock</SelectItem></SelectContent>
            </Select>
          </div>}
          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-qty">
              Qty <span className="font-normal text-muted-foreground">(positive SKU units)</span>
            </Label>
            <Input id="movement-qty" type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="movement-note">Note</Label>
            <Input id="movement-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {fields && skuId && <p aria-live="polite" className="text-sm text-muted-foreground">Preview: {fields.qty > 0 ? "+" : ""}{fields.qty} SKU units{unitVolume != null ? ` · ${formatVolume(fields.qty * unitVolume)}` : ""} · {type.replace(/_/g, " ")}{fields.destState ? ` · ${fields.destState}` : ""}. Volume is calculated when recorded.</p>}
          <CommandFormMessage error={form.error} />
          <CommandFormFooter>
            <Button type="submit" disabled={form.submitting || !fields || (requiresChannel(type) && !saleChannelId) || !skuId || !locationId || !binId}>
              {form.submitting ? "Recording…" : "Record"}
            </Button>
          </CommandFormFooter>
        </form>
      </CommandForm>
  );
}
