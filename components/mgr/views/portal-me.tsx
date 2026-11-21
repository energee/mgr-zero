// components/mgr/views/portal-me.tsx — the portal Me sheet body: who is signed
// in, the account switch, the light/dark switch (the portal has no Settings
// page to hold it) and the footer actions (live: MeSheetActions).
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { ThemeToggle } from "@/components/mgr/theme-toggle";
import type { PortalMeViewModel } from "@/lib/mgr/portal-me-view";

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
      <ThemeToggle />
      {footer !== undefined ? footer : E.btns([["Guide", "g"], ["Change password", "g"], ["Sign out", "del"]])}
    </>
  );
}
