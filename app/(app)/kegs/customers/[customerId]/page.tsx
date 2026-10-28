// app/(app)/kegs/customers/[customerId]/page.tsx — Customer keg balance
// (screen record Customer keg balance): kegs one customer has out per pool
// and size with the deposit invoiced for them, from get_customer_keg_balance.
// A row whose kegs on deposit disagree with its kegs out is flagged (#577).
// Each row's Record return opens Record keg event prefilled with its pool,
// size, Returned and this customer (#1507); the count and bin stay to choose.
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
import { money } from "@/lib/mgr/money";
import { SIZE_LABEL } from "@/lib/mgr/keg-labels";
import { navTitle } from "@/lib/mgr/nav";
import { cache } from "react";
import type { KegSize } from "@/lib/mgr/keg-fleet-view";
import { KegEventForm } from "../../event-form";

const getCustomerData = cache(async function getCustomerData(customerId: string) {
  if (!isUuid(customerId)) notFound();
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const customer = ((await runCommand("list_customers", {}, ctx)) as { id: string; name: string }[]).find((c) => c.id === customerId);
  if (!customer) notFound();
  return { ctx, customer };
});

export async function generateMetadata({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  await getCustomerData(customerId);
  return { title: navTitle("/kegs/customers") };
}

type Balance = {
  rows: { pool_id: string; pool_name: string; keg_size: string; kegs_out: number; kegs_on_deposit: number; deposit_cents: number; mismatch: boolean }[];
  kegs_out: number; deposit_cents: number;
};

export default async function CustomerKegBalancePage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const { ctx, customer } = await getCustomerData(customerId);
  const [balance, locations, bins] = (await Promise.all([
    runCommand("get_customer_keg_balance", { customerId }, ctx),
    runCommand("list_locations", {}, ctx),
    runCommand("list_bins", {}, ctx),
  ])) as [Balance, { id: string; name: string }[], { id: string; location_id: string; name: string }[]];
  // The pools this customer holds kegs of are the only ones a return can name.
  const pools = [...new Map(balance.rows.map((r) => [r.pool_id, { id: r.pool_id, name: r.pool_name }])).values()];
  return (
    <KegBalanceView
      model={toKegBalanceViewProps({
        backHref: "/kegs",
        customer: customer.name,
        kegs: `${balance.kegs_out} kegs`,
        deposits: `${money(balance.deposit_cents)} deposits held`,
        rows: balance.rows.map((r) => ({
          key: `${r.pool_id}-${r.keg_size}`,
          title: `${r.pool_name} ${SIZE_LABEL[r.keg_size] ?? r.keg_size}`,
          detail: r.mismatch ? `${r.kegs_out} out · ${r.kegs_on_deposit} on deposit` : `${r.kegs_out} out`,
          trailing: money(r.deposit_cents),
          warning: r.mismatch,
        })),
      })}
      // A row of deposits held with no keg out has nothing to return.
      rowActions={Object.fromEntries(balance.rows.map((r) => [`${r.pool_id}-${r.keg_size}`, r.kegs_out > 0
        ? <KegEventForm label="Record return" pools={pools} locations={locations} bins={bins} customers={[customer]}
          prefill={{ poolId: r.pool_id, kegSize: r.keg_size as KegSize, reason: "returned", customerId }} />
        : null]))}
      footer={<Link href={`/kegs/history?customer=${customerId}`}>{E.nav("Keg event history", "this customer's events")}</Link>}
    />
  );
}
