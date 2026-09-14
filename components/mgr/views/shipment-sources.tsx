"use client";

import { useState } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";

export type ShipmentAllocation = { key: string; qty: string; toBinId: string };
export type ShipmentAllocations = Record<string, ShipmentAllocation[]>;
export type ShipmentSourceLine = { key: string; name: string; qty: number; options: { key: string; label: string }[] };

export function ShipmentSourcesView({ lines, allocations, onChange, destinationBins = [], disabled = false }: {
  lines: ShipmentSourceLine[]; allocations?: ShipmentAllocations;
  onChange?: (value: ShipmentAllocations) => void;
  destinationBins?: { id: string; name: string }[]; disabled?: boolean;
}) {
  const [internal, setInternal] = useState<ShipmentAllocations>(allocations ?? {});
  const current = onChange ? allocations ?? {} : internal;
  const change = (value: ShipmentAllocations) => { setInternal(value); onChange?.(value); };
  const patch = (key: string, index: number, update: Partial<ShipmentAllocation>) =>
    change({ ...current, [key]: current[key].map((row, i) => i === index ? { ...row, ...update } : row) });
  return <>
    {E.ttl("Source bin and lot")}
    {E.fld("Source quantities", "Every source sums to its shipped line")}
    {lines.filter(line => line.qty > 0).map(line => <div key={line.key} className="flex flex-col gap-2">
      {E.ttl(line.name)}
      {(current[line.key] ?? []).map((row, index) => <div key={index} className="flex flex-col gap-2">
        {E.pick("Source " + (index + 1), row.key, [{ value: "", label: "Choose bin and lot" }, ...(line.options.map(option => ({ value: option.key, label: option.label })))], { onChange: (nextValue: string) => patch(line.key, index, { key: nextValue }), required: true, "aria-label": `${line.name} source ${index + 1}` })}
        {E.edit("Source quantity", row.qty, "number", undefined, { onChange: (nextValue: string) => patch(line.key, index, { qty: nextValue }), required: true, min: "0.01", step: "0.01", "aria-label": `${line.name} source ${index + 1} quantity` })}
        {destinationBins.length > 0 && E.pick("Destination bin", row.toBinId, [{ value: "", label: "Choose destination" }, ...(destinationBins.map(bin => ({ value: bin.id, label: bin.name })))], { onChange: (nextValue: string) => patch(line.key, index, { toBinId: nextValue }), required: true, "aria-label": `${line.name} destination ${index + 1}` })}
        <Button type="button" variant="ghost" onClick={() => change({ ...current, [line.key]: current[line.key].filter((_, i) => i !== index) })}>Remove source</Button>
      </div>)}
      <Button type="button" variant="outline" disabled={disabled} onClick={() => change({ ...current, [line.key]: [...(current[line.key] ?? []), { key: "", qty: "", toBinId: "" }] })}>Add source</Button>
    </div>)}
  </>;
}
