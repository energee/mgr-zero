// app/(app)/kegs/page.tsx — Keg fleet (screen record Keg fleet): every keg
// pool with Edit → update_keg_pool, Add keg pool → create_keg_pool, and the
// kegs each bin holds per pool × size from get_keg_fleet. Record keg event
// → record_keg_event. Links to Keg event history and to the balance of each
// customer holding kegs. Warehouse and Admin.
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { KegFleetView } from "@/components/mgr/views/keg-fleet";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toKegFleetViewProps } from "@/lib/mgr/keg-fleet-view";
import "@/lib/commands/all";
import { KegEventForm } from "./event-form";
import { dollars, KIND_LABEL, SIZE_LABEL } from "./keg-labels";
import { PoolForm, type Pool } from "./pool-form";

type Fleet = {
  pools: (Pool & { vendor_id: string | null })[];
  rows: { pool_id: string; keg_size: string; location_name: string; bin_name: string; qty: number }[];
  customers: { customer_id: string; name: string; kegs_out: number }[];
};
type Named = { id: string; name: string };
type Bin = { id: string; location_id: string; name: string };

export default async function KegsPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [fleet, locations, bins, customers, vendors] = (await Promise.all([
    runCommand("get_keg_fleet", {}, ctx),
    runCommand("list_locations", {}, ctx),
    runCommand("list_bins", {}, ctx),
    runCommand("list_customers", {}, ctx),
    runCommand("list_vendors", {}, ctx),
  ])) as [Fleet, Named[], Bin[], Named[], Named[]];
  const activePools = fleet.pools.filter((p) => p.active);
  return (
    <KegFleetView
      model={toKegFleetViewProps({ backHref: "/inventory" })}
      createAction={<PoolForm vendors={vendors} />}
      list={
        fleet.pools.length === 0 ? E.blank("No keg pools yet") : fleet.pools.map((p) => {
          const rows = fleet.rows.filter((r) => r.pool_id === p.id && r.qty !== 0);
          const total = rows.reduce((n, r) => n + r.qty, 0);
          return (
            <div key={p.id}>
              {E.row(p.name, `${KIND_LABEL[p.kind]} · ${total} on hand · deposit ${dollars(p.deposit_cents)}${p.active ? "" : " · out of service"}`,
                <PoolForm key={`${p.id}-${p.name}-${p.vendor_id}-${p.per_fill_cents}-${p.deposit_cents}-${p.active}`} pool={p} vendors={vendors} />)}
              {rows.map((r) => (
                <div key={`${r.keg_size}-${r.location_name}-${r.bin_name}`}>
                  {E.row(`${p.name} ${SIZE_LABEL[r.keg_size] ?? r.keg_size} · ${r.location_name}`, `${r.qty} on hand · ${r.bin_name}`, String(r.qty))}
                </div>
              ))}
            </div>
          );
        })
      }
      eventForm={activePools.length > 0 && locations.length > 0
        ? <div className="py-2"><KegEventForm pools={activePools} locations={locations} bins={bins} customers={customers} /></div>
        : null}
      navs={
        <>
          <Link href="/kegs/history">{E.nav("Keg event history", "acquired, shipped, returned, lost, found, retired")}</Link>
          {fleet.customers.map((c) => <Link key={c.customer_id} href={`/kegs/customers/${c.customer_id}`}>{E.nav("Customer keg balance", `${c.name} · ${c.kegs_out} out`)}</Link>)}
        </>
      }
    />
  );
}
