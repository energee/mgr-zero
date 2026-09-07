// app/(app)/batches/vessel-form.tsx — one CommandForm for upsert_vessel:
// name, kind, and capacity in barrels. Contents are never entered here —
// they derive from the vessel's open occupancy (Cellar, Brew day).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useCommandForm } from "@/lib/commands/use-command-form";

const KINDS = ["fermenter", "brite", "barrel", "kettle", "other"] as const;
type Kind = (typeof KINDS)[number];
type Vessel = { id: string; name: string; kind: string; capacity_bbl: number };

export function VesselForm({ vessel }: { vessel?: Vessel }) {
  const [name, setName] = useState(vessel?.name ?? "");
  const [kind, setKind] = useState<Kind>((vessel?.kind as Kind) ?? "fermenter");
  const [capacityBbl, setCapacityBbl] = useState(vessel ? String(vessel.capacity_bbl) : "");
  const form = useCommandForm("upsert_vessel", {
    build: () => ({ id: vessel?.id, name, kind, capacityBbl: Number(capacityBbl) }),
    reset: () => { setName(vessel?.name ?? ""); setKind((vessel?.kind as Kind) ?? "fermenter"); setCapacityBbl(vessel ? String(vessel.capacity_bbl) : ""); },
  });
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title={vessel ? "Edit vessel" : "New vessel"}
      trigger={<Button size="sm" variant={vessel ? "outline" : "default"}>{vessel ? "Edit" : "New vessel"}</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ves-name">Name</Label>
          <Input id="ves-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ves-kind">Kind</Label>
          <NativeSelect id="ves-kind" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ves-cap">Capacity (bbl)</Label>
          <Input id="ves-cap" type="number" min="0" step="any" value={capacityBbl} onChange={(e) => setCapacityBbl(e.target.value)} required />
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !name.trim() || !(Number(capacityBbl) > 0)}>{form.submitting ? "Saving…" : "Save vessel"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
