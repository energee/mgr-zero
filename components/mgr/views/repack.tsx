import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { RepackViewModel } from "@/lib/mgr/repack-view";

export function RepackView({ model, footer }: { model: RepackViewModel; footer?: ReactNode }) {
  return <>
    {E.fld("Break", model.parent)}
    {E.fld("Location · bin", model.location)}
    {E.qty(model.qty, model.unit)}
    {E.tape(model.tape)}
    {E.info(model.preview)}
    {E.fld("Damaged on break", model.damaged)}
    {footer !== undefined ? footer : E.pin(model.unavailable ? E.gated("Record repack", model.unavailable) : E.btn("Record repack"))}
  </>;
}
