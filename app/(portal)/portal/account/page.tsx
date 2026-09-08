// app/(portal)/portal/account/page.tsx — the Account tab, drawn to the
// Account screen record from get_portal_account: ship-tos, this login's
// membership, keg deposits held. No portal write; peers are never listed.
import { PortalAccountView } from "@/components/mgr/views/portal-account";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toPortalAccountViewProps, type PortalAccountSnapshot } from "@/lib/mgr/portal-account-view";
import "@/lib/commands/all";

export default async function PortalAccountPage() {
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const acct = (await runCommand("get_portal_account", {}, ctx)) as PortalAccountSnapshot;
  return <PortalAccountView model={toPortalAccountViewProps(acct)} />;
}
