// components/mgr/views/schedule-packaging-run.tsx — the Schedule packaging run
// sheet body, one drawing for the inventory and the live form: the live form
// passes callbacks in `controls` and its error and submit in `messages`/`footer`.
"use client";

import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { scheduleRunReason, type SchedulePackagingRunViewModel } from "@/lib/mgr/schedule-packaging-run-view";

export type SchedulePackagingRunControls = Partial<Record<"plannedOn" | "brand" | "source", (value: string) => void>> & {
  qty?: (key: string, value: string) => void;
};

export function SchedulePackagingRunView({ model, controls = {}, messages, footer, catalogHref }: {
  model: SchedulePackagingRunViewModel; controls?: SchedulePackagingRunControls; messages?: ReactNode; footer?: ReactNode; catalogHref?: string | null;
}) {
  const { qty } = controls;
  return <>
    {E.edit("Planned date", model.plannedOn, "date", undefined, { onChange: controls.plannedOn, required: Boolean(controls.plannedOn) })}
    {E.ttl("Source")}
    {E.pick("Brand", model.brandId, model.brandOptions, { id: "schedule-run-brand", onChange: controls.brand, placeholder: "Brand", required: Boolean(controls.brand), empty: catalogHref === null
      ? { text: "No brands yet. An admin or sales member can add a brand in Catalog." }
      : { text: "No brands yet.", label: "Add a brand in Catalog", to: "Catalog", href: catalogHref } })}
    {E.pick("Source tank · optional", model.occupancyId, model.sourceOptions, { id: "schedule-run-source", onChange: controls.source, displayValue: model.source || undefined, empty: { text: "No occupied tanks yet. Leave the source blank and pick it before starting the run." } })}
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
    {model.materials ? E.tbl(["Material", "Planned", "On hand", "Short"], model.materials, ["l", "r", "r", "r"]) : E.info(model.materialsMessage ?? "Choose planned outputs to preview materials.")}
    {model.warning ? E.note(model.warning) : null}
    {messages}
    {footer !== undefined ? footer : E.submit("Save run plan", { reason: scheduleRunReason(model) })}
    {E.info("Nothing moves until the run closes. Saving writes the run and its planned outputs together.")}
  </>;
}
