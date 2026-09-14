"use client";

import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NONE } from "@/components/ui/select";
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
    {E.pick("Brand", controls.brandId, controls.brands.map(brand => ({ value: brand.id, label: brand.name })), { onChange: controls.onBrand, placeholder: "Brand", id: "sr-brand" })}
    {E.pick("Source tank · optional", controls.occupancyId || NONE, [{ value: NONE, label: "No source yet" }, ...(controls.occupancies.map((o) => ({ value: o.occupancy_id, label: (o.vessel_name ?? "—") + " · " + (o.brand_name ?? "no brand") + " · " + (Number(o.bbl)) + " bbl" })))], { onChange: value => controls.onOccupancy(value === NONE ? "" : value) })}
    {E.edit("Planned date", controls.plannedOn, "date", undefined, { onChange: (nextValue: string) => controls.onPlannedOn(nextValue), id: "sr-date", required: true })}
    <div className="flex flex-col gap-2"><Label>Planned outputs</Label>{controls.lines.map((line, index) => <div key={index} className="flex gap-2">{E.pick(`Line ${index + 1} SKU`, line.skuId, controls.skus.map(sku => ({ value: sku.id, label: sku.label })), { onChange: value => controls.onSku(index, value), placeholder: "SKU", hideLabel: true })}{E.edit(`Line ${index + 1} qty`, line.qtyPlanned, "number", undefined, { onChange: (nextValue: string) => controls.onQty(index, nextValue), min: "0", step: "any", hideLabel: true })}</div>)}<Button type="button" variant="ghost" size="sm" className="w-fit" onClick={controls.onAddLine}>Add line</Button></div>
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
