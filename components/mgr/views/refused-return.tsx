"use client";

import { Fragment, useState } from "react";
import { E } from "@/components/mgr/e";

export type RefusedReturnModel = {
  backHref?: string; title: string; locationId: string;
  locations: { value: string; label: string }[];
  bins: { value: string; label: string; locationId: string }[];
  lines: { id: string; name: string; outstanding: number; sources: { id: string; label: string; shipped: number }[] }[];
};
export type RefusedReturnEntry = { qty: number; binId: string; damaged: boolean };

export function RefusedReturnFormView({ model, busy, error, onSubmit }: {
  model: RefusedReturnModel; busy?: boolean; error?: string | null;
  onSubmit?: (input: { locationId: string; lines: { orderLineId: string; sources: (RefusedReturnEntry & { movementId: string })[] }[] }) => void;
}) {
  const [locationId, setLocationId] = useState(model.locationId);
  const [entries, setEntries] = useState<Record<string, RefusedReturnEntry>>({});
  function submit() {
    const lines = model.lines.map((l) => ({ orderLineId: l.id, sources: l.sources
      .filter((s) => (entries[s.id]?.qty ?? 0) > 0).map((s) => ({ movementId: s.id, ...entries[s.id] })) })).filter((l) => l.sources.length);
    onSubmit?.({ locationId, lines });
  }
  const selected = Object.values(entries).filter((e) => e.qty > 0);
  const invalid = model.lines.some((l) => l.sources.reduce((n, s) => n + (entries[s.id]?.qty ?? 0), 0) > l.outstanding);
  return <>
    {E.back("Confirm delivery", model.title, undefined, model.backHref)}
    {E.note("Record only beer physically received. Choose its shipped source and destination bin. Damaged beer is checked in and posted as loss together.")}
    {E.pick("Return location", locationId, model.locations, { onChange: (id) => { setLocationId(id); setEntries({}); }, required: true })}
    {model.lines.map((l) => <Fragment key={l.id}>
      {E.ttl(l.name)}{E.fld("Outstanding refused", String(l.outstanding))}
      {l.sources.map((s) => {
        const entry = entries[s.id] ?? { qty: 0, binId: "", damaged: false };
        return <Fragment key={s.id}>
          {E.fld("Shipped source", s.label)}
          {E.edit("Received quantity", String(entry.qty), "number", undefined, { min: 0, max: Math.min(s.shipped, l.outstanding), step: 1, onChange: (value) => setEntries({ ...entries, [s.id]: { ...entry, qty: Number(value) } }) })}
          {E.pick("Destination bin", entry.binId, model.bins.filter((b) => b.locationId === locationId), { onChange: (value) => setEntries({ ...entries, [s.id]: { ...entry, binId: value } }) })}
          {E.row("Damaged", "Post received quantity as loss", E.sw(entry.damaged, `Damaged ${s.label}`, (value) => setEntries({ ...entries, [s.id]: { ...entry, damaged: value } })))}
        </Fragment>;
      })}
    </Fragment>)}
    {error && E.status(error, "w")}
    {invalid && E.status("Received quantity exceeds the outstanding refusal", "w")}
    {E.btn(busy ? "Saving…" : "Check in refused beer", busy || invalid || !locationId || !selected.length || selected.some((e) => !e.binId) ? "irr disabled" : "irr", undefined, submit)}
  </>;
}
