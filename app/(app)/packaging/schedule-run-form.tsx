// app/(app)/packaging/schedule-run-form.tsx — CommandForm for
// schedule_packaging_run: the brand being packaged and the date commit the
// run; the source tank is optional here (picked later, on the run's own
// page) and outputs are SKU/quantity lines.
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { SchedulePackagingRunView } from "@/components/mgr/views/schedule-packaging-run";
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
  const validLines = lines.filter((l) => l.skuId && l.qtyPlanned.trim() !== "" && Number(l.qtyPlanned) >= 0);
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
        <SchedulePackagingRunView model={{ plannedOn: "", source: "", sourceDetail: "", outputs: [], leftInSource: "", leftLabel: "", materials: [] }} controls={{
          brands, brandId, onBrand: setBrandId, occupancies, occupancyId, onOccupancy: setOccupancyId,
          plannedOn, onPlannedOn: setPlannedOn, skus, lines,
          onSku: (index, value) => setLines((prev) => prev.map((line, i) => i === index ? { ...line, skuId: value } : line)),
          onQty: (index, value) => setLines((prev) => prev.map((line, i) => i === index ? { ...line, qtyPlanned: value } : line)),
          onAddLine: () => setLines((prev) => [...prev, { skuId: "", qtyPlanned: "" }]),
          messages: <CommandFormMessage error={form.error} />,
          footer: <CommandFormFooter><Button type="submit" disabled={form.submitting || !ready}>{form.submitting ? "Saving…" : "Save run plan"}</Button></CommandFormFooter>,
        }} />
      </form>
    </CommandForm>
  );
}
