// app/(app)/packaging/schedule-run-form.tsx — CommandForm for
// schedule_packaging_run: the brand being packaged and the date commit the
// run; the source tank is optional here (picked later, on the run's own
// page) and outputs are SKU/quantity lines.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useCommandForm } from "@/lib/commands/use-command-form";

type Brand = { id: string; name: string };
type Occupancy = { occupancy_id: string; vessel_name: string | null; brand_name: string | null; bbl: number };
type Sku = { id: string; label: string };
type Line = { skuId: string; qtyPlanned: string };

export function ScheduleRunForm({ brands, occupancies, skus }: { brands: Brand[]; occupancies: Occupancy[]; skus: Sku[] }) {
  const [brandId, setBrandId] = useState("");
  const [occupancyId, setOccupancyId] = useState("");
  const [plannedOn, setPlannedOn] = useState("");
  const [lines, setLines] = useState<Line[]>([{ skuId: "", qtyPlanned: "" }]);
  const validLines = lines.filter((l) => l.skuId && Number(l.qtyPlanned) >= 0);
  const form = useCommandForm("schedule_packaging_run", {
    build: () => ({
      brandId, plannedOn, occupancyId: occupancyId || undefined,
      outputs: validLines.map((l) => ({ skuId: l.skuId, qtyPlanned: Number(l.qtyPlanned) })),
    }),
    reset: () => { setBrandId(""); setOccupancyId(""); setPlannedOn(""); setLines([{ skuId: "", qtyPlanned: "" }]); },
  });
  const ready = brandId && plannedOn && validLines.length > 0;
  return (
    <CommandForm open={form.open} onOpenChange={form.setOpen} title="Schedule run" trigger={<Button size="sm">Schedule run</Button>}>
      <form onSubmit={form.submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sr-brand">Brand</Label>
          <NativeSelect id="sr-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">Brand</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sr-source">Source tank · optional</Label>
          <NativeSelect id="sr-source" value={occupancyId} onChange={(e) => setOccupancyId(e.target.value)}>
            <option value="">No source yet</option>
            {occupancies.map((o) => (
              <option key={o.occupancy_id} value={o.occupancy_id}>{o.vessel_name ?? "—"} · {o.brand_name ?? "no brand"} · {Number(o.bbl)} bbl</option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sr-date">Planned date</Label>
          <Input id="sr-date" type="date" value={plannedOn} onChange={(e) => setPlannedOn(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Planned outputs</Label>
          {lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <NativeSelect aria-label={`Line ${i + 1} SKU`} value={l.skuId} onChange={(e) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, skuId: e.target.value } : x)))}>
                <option value="">SKU</option>{skus.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </NativeSelect>
              <Input aria-label={`Line ${i + 1} qty`} type="number" min="0" step="any" className="w-24" value={l.qtyPlanned} onChange={(e) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, qtyPlanned: e.target.value } : x)))} />
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setLines((prev) => [...prev, { skuId: "", qtyPlanned: "" }])}>Add line</Button>
        </div>
        <CommandFormMessage error={form.error} />
        <CommandFormFooter>
          <Button type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Save run plan"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}
