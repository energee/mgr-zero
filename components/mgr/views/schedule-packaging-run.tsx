import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { SchedulePackagingRunViewModel } from "@/lib/mgr/schedule-packaging-run-view";

export function SchedulePackagingRunView({ model, form }: { model: SchedulePackagingRunViewModel; form?: ReactNode }) {
  if (form !== undefined) return form;
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
