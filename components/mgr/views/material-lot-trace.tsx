// components/mgr/views/material-lot-trace.tsx — shared supplier-lot recall surface.
import { Fragment } from "react";
import { E } from "@/components/mgr/e";
import { LotRecipients } from "./lot-trace";
import type { MaterialLotTraceViewModel } from "@/lib/mgr/material-lot-trace-view";

export function MaterialLotTraceView({ model }: { model: MaterialLotTraceViewModel }) {
  return <>
    {E.back("Compliance", model.title, undefined, model.backHref)}
    {E.fld("Material lot", model.detail)}
    {E.fld("Recorded balance", model.balance)}
    {E.ttl("Effective consumption")}
    {model.uses.length ? model.uses.map(use => <Fragment key={use.id}>{E.fld(use.title, use.detail)}</Fragment>) : E.blank("No recorded consumption")}
    {E.ttl("Finished lots")}
    {model.lots.length ? model.lots.map(lot => <Fragment key={lot.id}>{E.nav(lot.title, lot.detail, "", undefined, lot.href)}</Fragment>) : E.blank("No recorded finished lots")}
    {E.ttl("Recipients")}
    <LotRecipients recipients={model.recipients} empty="No recorded shipments of these lots" />
    {E.note(model.note)}
  </>;
}
