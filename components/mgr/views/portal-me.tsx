// components/mgr/views/portal-me.tsx — inventory Portal Me drawing. Live Me
// stays MeSheet; this view keeps a footer slot for a later live mount.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PortalMeViewModel } from "@/lib/mgr/portal-me-view";

export type { PortalMeViewModel };

export function PortalMeView({
  model,
  footer,
}: {
  model: PortalMeViewModel;
  footer?: ReactNode;
}) {
  return (
    <>
      {E.fld("Signed in as", model.email)}
      {E.fld("Account", model.account)}
      {footer !== undefined ? footer : E.btns([["Change password", "g"], ["Sign out", "g"]])}
    </>
  );
}
