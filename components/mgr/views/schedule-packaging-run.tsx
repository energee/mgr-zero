"use client";

import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NONE, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { SchedulePackagingRunViewModel } from "@/lib/mgr/schedule-packaging-run-view";

type LiveControls = {
  brands: { id: string; name: string }[]; brandId: string; onBrand: (value: string) => void;
  occupancies: { occupancy_id: string; vessel_name: string | null; brand_name: string | null; bbl: number }[]; occupancyId: string; onOccupancy: (value: string) => void;
  plannedOn: string; onPlannedOn: (value: string) => void;
  skus: { id: string; label: string }[]; lines: { skuId: string; qtyPlanned: string }[];
  onSku: (index: number, value: string) => void; onQty: (index: number, value: string) => void; onAddLine: () => void;
  messages?: ReactNode; footer?: ReactNode;
};

export function SchedulePackagingRunView({ model, controls }: { model: SchedulePackagingRunViewModel; controls?: LiveControls }) {
  if (controls) return <>
    <div className="flex flex-col gap-2"><Label htmlFor="sr-brand">Brand</Label><Select value={controls.brandId} onValueChange={controls.onBrand}><SelectTrigger id="sr-brand"><SelectValue placeholder="Brand" /></SelectTrigger><SelectContent>{controls.brands.map((brand) => <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>)}</SelectContent></Select></div>
    <div className="flex flex-col gap-2"><Label htmlFor="sr-source">Source tank · optional</Label><Select value={controls.occupancyId || NONE} onValueChange={(value) => controls.onOccupancy(value === NONE ? "" : value)}><SelectTrigger id="sr-source"><SelectValue /></SelectTrigger><SelectContent><SelectItem value={NONE}>No source yet</SelectItem>{controls.occupancies.map((o) => <SelectItem key={o.occupancy_id} value={o.occupancy_id}>{o.vessel_name ?? "—"} · {o.brand_name ?? "no brand"} · {Number(o.bbl)} bbl</SelectItem>)}</SelectContent></Select></div>
    <div className="flex flex-col gap-2"><Label htmlFor="sr-date">Planned date</Label><Input id="sr-date" type="date" value={controls.plannedOn} onChange={(event) => controls.onPlannedOn(event.target.value)} required /></div>
    <div className="flex flex-col gap-2"><Label>Planned outputs</Label>{controls.lines.map((line, index) => <div key={index} className="flex gap-2"><Select value={line.skuId} onValueChange={(value) => controls.onSku(index, value)}><SelectTrigger aria-label={`Line ${index + 1} SKU`}><SelectValue placeholder="SKU" /></SelectTrigger><SelectContent>{controls.skus.map((sku) => <SelectItem key={sku.id} value={sku.id}>{sku.label}</SelectItem>)}</SelectContent></Select><Input aria-label={`Line ${index + 1} qty`} type="number" min="0" step="any" className="w-24" value={line.qtyPlanned} onChange={(event) => controls.onQty(index, event.target.value)} /></div>)}<Button type="button" variant="ghost" size="sm" className="w-fit" onClick={controls.onAddLine}>Add line</Button></div>
    {controls.messages}{controls.footer}
  </>;
  return <>
    {E.edit("Planned date", model.plannedOn, "date")}
    {E.ttl("Source")}
    {E.nav(model.source, model.sourceDetail)}
    {E.ttl("Planned outputs")}
    {model.outputs.map((row) => <div key={row.key}>{E.row(row.title, row.detail, <>{E.stq(row.qty)}{E.sw(row.listed, "On the wholesale list")}</>)}</div>)}
    {E.fld(model.leftLabel, model.leftInSource)}
    {E.ttl("Materials")}
    {E.tbl(["need", "have", "short"], model.materials)}
    {model.warning ? E.note(model.warning) : null}
    {E.btn("Save run plan")}
    {E.info("Nothing moves until the run closes. Saving writes the run and its planned outputs together.")}
  </>;
}
