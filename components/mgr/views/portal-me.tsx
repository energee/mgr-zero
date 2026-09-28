// components/mgr/views/portal-me.tsx — inventory Portal Me drawing. Live Me
// stays MeSheet; this view keeps a footer slot for a later live mount.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { PortalMeViewModel } from "@/lib/mgr/portal-me-view";

export type { PortalMeViewModel };

export function PortalMeView({
  model,
  footer,
  accounts = [], activeCustomerId, switchAction,
}: {
  model: PortalMeViewModel;
  footer?: ReactNode;
  accounts?: { value: string; label: string }[]; activeCustomerId?: string;
  switchAction?: (form: FormData) => Promise<void>;
}) {
  return (
    <>
      {E.fld("Signed in as", model.email)}
      {E.fld("Account", model.account)}
      {accounts.length > 1 && <form action={switchAction}>
        {E.pick("Customer account", activeCustomerId ?? "", accounts, { name: "customerId", required: true })}
        {E.btn("Switch account")}
      </form>}
      {footer !== undefined ? footer : E.btns([["Change password", "g"], ["Sign out", "del"]])}
    </>
  );
}
