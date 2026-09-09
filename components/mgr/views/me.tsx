// components/mgr/views/me.tsx — staff Me inventory drawing. Live stays MeSheet.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { MeViewModel } from "@/lib/mgr/me-view";

export type { MeViewModel };

export function MeView({ model, footer }: { model: MeViewModel; footer?: ReactNode }) {
  return (
    <>
      {E.row(model.name, model.role, "", "", E.face({ className: "size-10" }))}
      {E.fld("Signed in as", model.email)}
      {E.ttl("Brewery")}
      {E.row(model.currentBrewery, "current", "✓", "ok")}
      {E.row(model.otherBrewery, "", E.act("Switch"))}
      {E.sp()}
      {footer !== undefined ? footer : E.btns([["Change password", "g"], ["Sign out", "del"]])}
    </>
  );
}
