"use client";

import { useState } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

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
        <Field><FieldLabel>Source {index + 1}</FieldLabel>
          <select className="min-w-0 rounded border p-2" aria-label={`${line.name} source ${index + 1}`} required value={row.key} onChange={event => patch(line.key, index, { key: event.target.value })}>
            <option value="">Choose bin and lot</option>
            {line.options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
          </select>
        </Field>
        <Field><FieldLabel>Source quantity</FieldLabel><Input aria-label={`${line.name} source ${index + 1} quantity`} type="number" min="0.01" step="0.01" required value={row.qty} onChange={event => patch(line.key, index, { qty: event.target.value })} /></Field>
        {destinationBins.length > 0 && <Field><FieldLabel>Destination bin</FieldLabel>
          <select className="min-w-0 rounded border p-2" aria-label={`${line.name} destination ${index + 1}`} required value={row.toBinId} onChange={event => patch(line.key, index, { toBinId: event.target.value })}>
            <option value="">Choose destination</option>
            {destinationBins.map(bin => <option key={bin.id} value={bin.id}>{bin.name}</option>)}
          </select>
        </Field>}
        <Button type="button" variant="ghost" onClick={() => change({ ...current, [line.key]: current[line.key].filter((_, i) => i !== index) })}>Remove source</Button>
      </div>)}
      <Button type="button" variant="outline" disabled={disabled} onClick={() => change({ ...current, [line.key]: [...(current[line.key] ?? []), { key: "", qty: "", toBinId: "" }] })}>Add source</Button>
    </div>)}
  </>;
}
