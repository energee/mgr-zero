// app/(app)/materials/count-form.tsx — CommandForm for record_material_count
// (Cycle count sheet): one material, the bin being counted, one number in
// base units. Only the variance posts; the command decides which lot moves.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };
type OnHand = { location_id: string; bin_id: string; qty: number };

export function CountForm({ materialId, materialName, uom, locations, bins, onHand }: {
  materialId: string; materialName: string; uom: string; locations: Location[]; bins: Bin[]; onHand: OnHand[];
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const binsHere = bins.filter((b) => b.location_id === locationId);
  const [binId, setBinId] = useState(binsHere[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const form = useCommandForm("record_material_count", {
    build: () => ({ locationId, binId, lines: [{ materialId, qty: Number(qty) }] }),
    reset: () => setQty(""),
  });
  const system = Number(onHand.find((o) => o.location_id === locationId && o.bin_id === binId)?.qty ?? 0);
  const variance = qty === "" ? null : Number(qty) - system;
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={`Count ${materialName}`} trigger={<Button variant="ghost" size="sm">Count</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ct-loc">Location</Label>
            <Select value={locationId} onValueChange={(v) => { setLocationId(v); setBinId(bins.find((b) => b.location_id === v)?.id ?? ""); }}>
              <SelectTrigger id="ct-loc"><SelectValue placeholder="Location" /></SelectTrigger>
              <SelectContent>{locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ct-bin">Bin</Label>
            <Select value={binId} onValueChange={setBinId}>
              <SelectTrigger id="ct-bin"><SelectValue placeholder="Bin" /></SelectTrigger>
              <SelectContent>{binsHere.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ct-qty">Counted ({uom})</Label>
          <Input id="ct-qty" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </div>
        <p className="text-sm text-muted-foreground">
          system {system.toLocaleString()}{variance === null ? "" : ` · variance ${variance > 0 ? "+" : ""}${variance.toLocaleString()}`}
          {variance ? " · a shortage leaves the earliest best-by lots first; an overage lands on the newest" : ""}
        </p>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !locationId || !binId || qty === ""}>{form.submitting ? "Recording…" : "Record count"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
