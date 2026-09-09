// app/(app)/kegs/customers/[customerId]/page.tsx — Customer keg balance
// (screen record Customer keg balance): kegs one customer has out per pool
// and size with the deposit invoiced for them, from get_customer_keg_balance.
// Reachable from Keg fleet; history filtered to this customer is one tap.
import Link from "next/link";
import { notFound } from "next/navigation";
import { E } from "@/components/mgr/e";
import { KegBalanceView } from "@/components/mgr/views/keg-balance";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext, isUuid } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toKegBalanceViewProps } from "@/lib/mgr/keg-balance-view";
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
    <KegBalanceView
      model={toKegBalanceViewProps({
        backHref: "/kegs",
        customer: customer.name,
        kegs: `${balance.kegs_out} kegs`,
        deposits: `${dollars(balance.deposit_cents)} deposits held`,
        rows: balance.rows.map((r) => ({
          key: `${r.pool_id}-${r.keg_size}`,
          title: `${r.pool_name} ${SIZE_LABEL[r.keg_size] ?? r.keg_size}`,
          detail: `${r.kegs_out} out`,
          trailing: dollars(r.deposit_cents),
        })),
      })}
      footer={<Link href={`/kegs/history?customer=${customerId}`}>{E.nav("Keg event history", "this customer's events")}</Link>}
    />
  );
}
