// app/(app)/kegs/customers/[customerId]/page.tsx — Customer keg balance
// (screen record Customer keg balance): kegs one customer has out per pool
// and size with the deposit invoiced for them, from get_customer_keg_balance.
// Reachable from Keg fleet; history filtered to this customer is one tap.
import Link from "next/link";
import { notFound } from "next/navigation";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext, isUuid } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { dollars, SIZE_LABEL } from "../../keg-labels";

type Balance = { rows: { pool_id: string; pool_name: string; keg_size: string; kegs_out: number; deposit_cents: number }[]; kegs_out: number; deposit_cents: number };

export default async function CustomerKegBalancePage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  if (!isUuid(customerId)) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const customer = ((await runCommand("list_customers", {}, ctx)) as { id: string; name: string }[]).find((c) => c.id === customerId);
  if (!customer) notFound();
  const balance = (await runCommand("get_customer_keg_balance", { customerId }, ctx)) as Balance;
  return (
    <>
      {E.back("Keg fleet", customer.name, undefined, "/kegs")}
      {E.num(`${balance.kegs_out} kegs`, `${dollars(balance.deposit_cents)} deposits held`)}
      {balance.rows.length === 0 ? E.blank("No kegs currently out") : balance.rows.map((r) => (
        <div key={`${r.pool_id}-${r.keg_size}`}>
          {E.row(`${r.pool_name} ${SIZE_LABEL[r.keg_size] ?? r.keg_size}`, `${r.kegs_out} out`, dollars(r.deposit_cents))}
        </div>
      ))}
      <Link href={`/kegs/history?customer=${customerId}`}>{E.nav("Keg event history", "this customer's events")}</Link>
      {E.info("Beer returns use Return shipment. Empty keg returns are recorded from Keg fleet.")}
    </>
  );
}
