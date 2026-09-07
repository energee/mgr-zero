// app/(app)/packaging/[id]/run-actions.tsx — the packaging run's next verb,
// by state: pick the tank (update_packaging_run), start it (same command,
// stamped startedAt — both require a tank), or close it
// (close_packaging_run: actual outputs, lot, packaged date, and the
// finished-goods location + bin).
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useCommandAction } from "@/lib/commands/use-command-form";

type Occupancy = { occupancy_id: string; vessel_name: string | null; brand_name: string | null; bbl: number };
type Output = { id: string; sku_id: string; qty_planned: number; qty_actual: number | null; sku_name: string | null };
type Location = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

export function PickTankForm({ runId, occupancies }: { runId: string; occupancies: Occupancy[] }) {
  const [occupancyId, setOccupancyId] = useState("");
  const { busy, error, run } = useCommandAction();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="pt-source">Source tank</Label>
        <NativeSelect id="pt-source" value={occupancyId} onChange={(e) => setOccupancyId(e.target.value)}>
          <option value="">Choose tank</option>
          {occupancies.map((o) => <option key={o.occupancy_id} value={o.occupancy_id}>{o.vessel_name ?? "—"} · {o.brand_name ?? "no brand"} · {Number(o.bbl)} bbl</option>)}
        </NativeSelect>
      </div>
      <CommandFormMessage error={error} />
      <Button className="w-full md:w-fit" disabled={busy || !occupancyId} onClick={() => run("update_packaging_run", { runId, occupancyId })}>Pick source</Button>
    </div>
  );
}

export function StartRunButton({ runId }: { runId: string }) {
  const { busy, error, run } = useCommandAction();
  return (
    <div className="flex flex-col gap-2">
      <CommandFormMessage error={error} />
      <Button className="w-full md:w-fit" disabled={busy} onClick={() => run("update_packaging_run", { runId, startedAt: new Date().toISOString() })}>Start</Button>
    </div>
  );
}

export function CloseRunForm({ runId, outputs, locations, bins }: { runId: string; outputs: Output[]; locations: Location[]; bins: Bin[] }) {
  const [bblDrawn, setBblDrawn] = useState("");
  const [actuals, setActuals] = useState<Record<string, string>>(Object.fromEntries(outputs.map((o) => [o.sku_id, String(o.qty_planned)])));
  const [lotCode, setLotCode] = useState("");
  const [packagedOn, setPackagedOn] = useState(new Date().toISOString().slice(0, 10));
  const [bestBy, setBestBy] = useState("");
  const [locationId, setLocationId] = useState("");
  const [binId, setBinId] = useState("");
  const { busy, error, run } = useCommandAction();
  const ready = Number(bblDrawn) >= 0 && lotCode.trim() && packagedOn && locationId && binId;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cr-drawn">Barrels drawn</Label>
        <Input id="cr-drawn" type="number" min="0" step="any" value={bblDrawn} onChange={(e) => setBblDrawn(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Actual outputs</Label>
        {outputs.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-2">
            <span className="text-sm">{o.sku_name ?? o.sku_id.slice(0, 8)}</span>
            <Input aria-label={`${o.sku_name ?? o.sku_id} actual`} type="number" min="0" step="any" className="w-24"
              value={actuals[o.sku_id] ?? ""} onChange={(e) => setActuals((prev) => ({ ...prev, [o.sku_id]: e.target.value }))} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cr-lot">Lot code</Label>
        <Input id="cr-lot" value={lotCode} onChange={(e) => setLotCode(e.target.value)} required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cr-packaged">Packaged on</Label>
          <Input id="cr-packaged" type="date" value={packagedOn} onChange={(e) => setPackagedOn(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cr-bestby">Best by · optional</Label>
          <Input id="cr-bestby" type="date" value={bestBy} onChange={(e) => setBestBy(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cr-loc">Finished goods location</Label>
        <NativeSelect id="cr-loc" value={locationId} onChange={(e) => { setLocationId(e.target.value); setBinId(""); }}>
          <option value="">Location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Bin" value={binId} onChange={(e) => setBinId(e.target.value)} disabled={!locationId}>
          <option value="">Bin</option>{bins.filter((b) => b.location_id === locationId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </NativeSelect>
      </div>
      <CommandFormMessage error={error} />
      <Button
        data-variant="irreversible" className="w-full bg-irreversible text-irreversible-foreground hover:bg-irreversible/90 md:w-fit"
        disabled={busy || !ready}
        onClick={() => run("close_packaging_run", {
          runId, bblDrawn: Number(bblDrawn),
          outputs: outputs.map((o) => ({ skuId: o.sku_id, qtyActual: Number(actuals[o.sku_id] || 0) })),
          lotCode, packagedOn, bestBy: bestBy || undefined, locationId, binId,
        })}
      >
        Close packaging run
      </Button>
    </div>
  );
}
