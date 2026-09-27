// components/mgr/views/schedule-packaging-run.tsx — the Schedule packaging run
// sheet body, one drawing for the inventory and the live form: the live form
// passes callbacks in `controls` and its error and submit in `messages`/`footer`.
"use client";

import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { SchedulePackagingRunViewModel } from "@/lib/mgr/schedule-packaging-run-view";

export type SchedulePackagingRunControls = Partial<Record<"plannedOn" | "brand" | "source", (value: string) => void>> & {
  qty?: (key: string, value: string) => void;
};

export function SchedulePackagingRunView({ model, controls = {}, messages, footer }: {
  model: SchedulePackagingRunViewModel; controls?: SchedulePackagingRunControls; messages?: ReactNode; footer?: ReactNode;
}) {
  const { qty } = controls;
  return <>
    {E.edit("Planned date", model.plannedOn, "date", undefined, { onChange: controls.plannedOn, required: Boolean(controls.plannedOn) })}
    {E.ttl("Source")}
    {E.pick("Brand", model.brandId, model.brandOptions, { onChange: controls.brand, placeholder: "Brand", required: Boolean(controls.brand) })}
    {E.pick("Source tank · optional", model.occupancyId, model.sourceOptions, { onChange: controls.source, forward: true, displayValue: model.source || undefined })}
    {model.sourceDetail ? E.fld("In the tank", model.sourceDetail) : null}
    {E.ttl("Planned outputs")}
    {model.outputs.length
      ? model.outputs.map((row) => <div key={row.key}>{E.row(row.title, row.detail, <>
        {E.stq(Number(row.qty) || 0, `${row.title} quantity`, qty ? { value: row.qty, onChange: (value) => qty(row.key, value), required: false } : undefined)}
        {row.listed === undefined ? null : E.sw(row.listed, "On the wholesale list")}
      </>)}</div>)
      : E.info(model.brandId ? "This brand has no packages yet." : "Pick a brand to plan its packages.")}
    {model.leftInSource ? E.fld(model.leftLabel, model.leftInSource) : null}
    {E.ttl("Materials")}
    {model.materials ? E.tbl(["need", "have", "short"], model.materials) : E.gated("Material shortfalls", "The plan can’t preview materials yet.")}
    {model.warning ? E.note(model.warning) : null}
    {messages}
    {footer !== undefined ? footer : E.btn("Save run plan")}
    {E.info("Nothing moves until the run closes. Saving writes the run and its planned outputs together.")}
  </>;
}
