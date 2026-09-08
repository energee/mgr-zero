// app/(app)/kegs/history/page.tsx — Keg event history (screen record Keg
// event history): the immutable keg ledger newest first from
// list_keg_events, filtered by ?pool= and ?customer= query params.
import Link from "next/link";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext, isUuid } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { REASON_LABEL, SIZE_LABEL } from "../keg-labels";

type Named = { id: string; name: string };
type Event = { id: string; pool_id: string; keg_size: string; qty: number; reason: string; customer_id: string | null; at: string; note: string | null };

export default async function KegHistoryPage({ searchParams }: { searchParams: Promise<{ pool?: string; customer?: string }> }) {
  const sp = await searchParams;
  const poolId = isUuid(sp.pool ?? "") ? sp.pool : undefined;
  const customerId = isUuid(sp.customer ?? "") ? sp.customer : undefined;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [events, pools, customers] = (await Promise.all([
    runCommand("list_keg_events", { poolId, customerId }, ctx),
    runCommand("list_keg_pools", {}, ctx),
    runCommand("list_customers", {}, ctx),
  ])) as [Event[], Named[], Named[]];
  const name = (list: Named[], id: string | null) => list.find((x) => x.id === id)?.name;
  const filter = (label: string, href: string, on: boolean) => (
    <Link key={href} href={href} className={`rounded-full border px-3 py-1 text-xs ${on ? "bg-primary text-primary-foreground" : ""}`}>{label}</Link>
  );
  return (
    <>
      {E.back("Keg fleet", "Keg event history", undefined, "/kegs")}
      <div className="flex flex-wrap gap-2 py-2">
        {filter("All pools", customerId ? `/kegs/history?customer=${customerId}` : "/kegs/history", !poolId)}
        {pools.map((p) => filter(p.name, `/kegs/history?pool=${p.id}${customerId ? `&customer=${customerId}` : ""}`, poolId === p.id))}
      </div>
      <div className="flex flex-wrap gap-2 pb-2">
        {filter("All customers", poolId ? `/kegs/history?pool=${poolId}` : "/kegs/history", !customerId)}
        {customers.map((c) => filter(c.name, `/kegs/history?customer=${c.id}${poolId ? `&pool=${poolId}` : ""}`, customerId === c.id))}
      </div>
      {events.length === 0 ? E.blank("No matching events") : events.map((e) => (
        <div key={e.id}>
          {E.row(
            `${REASON_LABEL[e.reason] ?? e.reason}${e.customer_id ? ` · ${name(customers, e.customer_id) ?? "customer"}` : ""}`,
            `${new Date(e.at).toLocaleDateString()} · ${e.qty} × ${name(pools, e.pool_id) ?? "pool"} ${SIZE_LABEL[e.keg_size] ?? e.keg_size}${e.note ? ` · ${e.note}` : ""}`,
            "", e.reason === "lost" ? "w" : e.reason === "returned" ? "ok" : "",
          )}
        </div>
      ))}
    </>
  );
}
