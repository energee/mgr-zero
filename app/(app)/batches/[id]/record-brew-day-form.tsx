// app/(app)/batches/[id]/record-brew-day-form.tsx — the one next verb on a
// planned batch: record_brew_day stamps the brew date and moves it into a
// vessel that is not already occupied.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useCommandAction } from "@/lib/commands/use-command-form";

type Vessel = { id: string; name: string; kind: string; capacity_bbl: number };

export function RecordBrewDayForm({ batchId, plannedBbl, vessels }: { batchId: string; plannedBbl: number; vessels: Vessel[] }) {
  const [vesselId, setVesselId] = useState("");
  const [initialBbl, setInitialBbl] = useState(String(plannedBbl));
  const [brewedOn, setBrewedOn] = useState(new Date().toISOString().slice(0, 10));
  const { busy, error, run } = useCommandAction();
  const ready = vesselId && Number(initialBbl) > 0 && brewedOn;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="bd-vessel">Vessel</Label>
        <NativeSelect id="bd-vessel" value={vesselId} onChange={(e) => setVesselId(e.target.value)}>
          <option value="">Choose vessel</option>{vessels.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.kind} · {Number(v.capacity_bbl)} bbl</option>)}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bd-bbl">Knockout barrels</Label>
        <Input id="bd-bbl" type="number" min="0" step="any" value={initialBbl} onChange={(e) => setInitialBbl(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bd-date">Brewed on</Label>
        <Input id="bd-date" type="date" value={brewedOn} onChange={(e) => setBrewedOn(e.target.value)} />
      </div>
      <CommandFormMessage error={error} />
      <Button
        data-variant="irreversible" className="w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit"
        disabled={busy || !ready}
        onClick={() => run("record_brew_day", { batchId, vesselId, initialBbl: Number(initialBbl), brewedOn })}
      >
        Record brew day
      </Button>
    </div>
  );
}
