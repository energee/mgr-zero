// app/(app)/cellar/cellar-transfer-form.tsx — CommandForm for
// record_cellar_transfer: move beer out of one open occupancy into a vessel
// (which may already be occupied — a blend — or empty, which opens a new
// occupancy). Loss is optional and defaults to zero.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Occupancy = { occupancy_id: string; vessel_name: string | null; batch_no: number | null; brand_name: string | null; bbl: number };
type Vessel = { id: string; name: string; kind: string; capacity_bbl: number };

export function CellarTransferForm({ occupancies, vessels }: { occupancies: Occupancy[]; vessels: Vessel[] }) {
  const [fromOccupancyId, setFromOccupancyId] = useState("");
  const [toVesselId, setToVesselId] = useState("");
  const [volumeBbl, setVolumeBbl] = useState("");
  const [lossBbl, setLossBbl] = useState("");
  const form = useCommandForm("record_cellar_transfer", {
    build: () => ({ fromOccupancyId, toVesselId, volumeBbl: Number(volumeBbl), lossBbl: lossBbl ? Number(lossBbl) : undefined }),
    reset: () => { setFromOccupancyId(""); setToVesselId(""); setVolumeBbl(""); setLossBbl(""); },
  });
  const ready = fromOccupancyId && toVesselId && Number(volumeBbl) > 0;
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Transfer" trigger={<Button size="sm">Transfer</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ct-from">From</Label>
          <Select value={fromOccupancyId} onValueChange={setFromOccupancyId}>
            <SelectTrigger id="ct-from"><SelectValue placeholder="Source occupancy" /></SelectTrigger>
            <SelectContent>
              {occupancies.map((o) => (
                <SelectItem key={o.occupancy_id} value={o.occupancy_id}>
                  {o.vessel_name ?? "—"} · {o.brand_name ?? "no brand"} · {Number(o.bbl)} bbl
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ct-to">To</Label>
          <Select value={toVesselId} onValueChange={setToVesselId}>
            <SelectTrigger id="ct-to"><SelectValue placeholder="Destination vessel" /></SelectTrigger>
            <SelectContent>{vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ct-vol">Barrels moving</Label>
          <Input id="ct-vol" type="number" min="0" step="any" value={volumeBbl} onChange={(e) => setVolumeBbl(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ct-loss">Loss (bbl) · optional</Label>
          <Input id="ct-loss" type="number" min="0" step="any" value={lossBbl} onChange={(e) => setLossBbl(e.target.value)} />
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button data-variant="irreversible" type="submit" className="bg-irreversible text-irreversible-foreground hover:bg-irreversible/90" disabled={form.submitting || !ready}>
            {form.submitting ? "Saving…" : "Record transfer"}
          </Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
