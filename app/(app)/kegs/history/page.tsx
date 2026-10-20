// app/(app)/kegs/history/page.tsx — Keg event history (screen record Keg
// event history): the immutable keg ledger newest first from
// list_keg_events, scoped by ?pool= and ?customer= query params; each Keg pool
// and Customer option carries the href that selects it (kegHistoryScope).
import { formatDate } from "@/lib/date-format";
import { KegHistoryView } from "@/components/mgr/views/keg-history";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { kegHistoryScope, toKegHistoryViewProps } from "@/lib/mgr/keg-history-view";
import "@/lib/commands/all";
import { REASON_LABEL, SIZE_LABEL } from "@/lib/mgr/keg-labels";

type Named = { id: string; name: string };
type Event = { id: string; pool_id: string; keg_size: string; qty: number; reason: string; customer_id: string | null; at: string; note: string | null };

export default async function KegHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const scope = kegHistoryScope(await searchParams);
  const { poolId, customerId } = scope;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [events, pools, allCustomers] = (await Promise.all([
    runCommand("list_keg_events", { poolId, customerId }, ctx),
    runCommand("list_keg_pools", {}, ctx),
    runCommand("list_customers", {}, ctx),
  ])) as [Event[], Named[], Named[]];
  const seen = new Set((await runCommand("list_keg_events", {}, ctx) as Event[]).map((e) => e.customer_id).filter(Boolean));
  const customers = allCustomers.filter((c) => seen.has(c.id) || c.id === customerId);
  const name = (list: Named[], id: string | null) => list.find((x) => x.id === id)?.name;
  return (
    <KegHistoryView
      model={toKegHistoryViewProps({
        backHref: "/kegs",
        pool: poolId ?? "all",
        poolOptions: scope.poolOptions(pools),
        customer: customerId ?? "all",
        customerOptions: scope.customerOptions(customers),
        rows: events.map((e) => ({
          key: e.id,
          title: `${REASON_LABEL[e.reason] ?? e.reason}${e.customer_id ? ` · ${name(customers, e.customer_id) ?? "customer"}` : ""}`,
          detail: `${formatDate(e.at, brewery.timeZone)} · ${e.qty} × ${name(pools, e.pool_id) ?? "pool"} ${SIZE_LABEL[e.keg_size] ?? e.keg_size}${e.note ? ` · ${e.note}` : ""}`,
          warning: e.reason === "lost",
          ok: e.reason === "returned",
        })),
      })}
    />
  );
}
