// app/(portal)/portal/account/page.tsx — the Account tab, drawn to the
// Account screen record from get_portal_account: ship-tos, this login's
// membership, keg deposits held. No portal write; peers are never listed.
import { E } from "@/components/mgr/e";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { money } from "@/lib/mgr/money";

type Account = {
  customer: { id: string; name: string };
  shipTos: { id: string; label: string; city: string; state: string; is_default: boolean }[];
  membership: { userId: string };
  deposits: { kegSize: string | null; kegsOnDeposit: number; depositCents: number }[];
};

export default async function PortalAccountPage() {
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const acct = (await runCommand("get_portal_account", {}, ctx)) as Account;
  return (
    <>
      {E.hd("Account", acct.customer.name)}
      {acct.shipTos.map((s) => <div key={s.id}>{E.row(`${s.label} ship-to${s.is_default ? " · default" : ""}`, `${s.city}, ${s.state}`)}</div>)}
      {E.row("You · buyer", "this login", "active")}
      {acct.deposits.map((d) => (
        <div key={d.kegSize ?? "all"}>
          {E.row("Keg deposits held", `${d.kegsOnDeposit} × ${d.kegSize ?? "keg"}`, money(d.depositCents))}
        </div>
      ))}
      {E.info("Contact the brewery to change account details.")}
    </>
  );
}
