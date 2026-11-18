// app/(app)/orders/changes/page.tsx — Changes after confirm (screen record of
// the same name): order changes made after the brewery confirmed, newest first
// from list_order_changes, filtered by ?reason=, ?staff= and ?customer= in the
// query (orderChangesScope), one page at a time (?cursor=). Admin and Sales.
import { OrderChangesView } from "@/components/mgr/views/order-changes";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import type { TeamMember } from "@/lib/commands/invites";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { historyPage, pageCursor, type HistoryPage } from "@/lib/mgr/history-page";
import { orderChangesScope, toOrderChangesViewProps, type OrderChangeRow } from "@/lib/mgr/order-changes-view";
import { navTitle } from "@/lib/mgr/nav";
import "@/lib/commands/all";

export const metadata = { title: navTitle("/orders/changes") };

export default async function OrderChangesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const scope = orderChangesScope(params);
  const cursor = pageCursor(params.cursor);
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [changes, team, customers] = (await Promise.all([
    runCommand("list_order_changes", { reasonCode: scope.reason, staffId: scope.staff, customerId: scope.customer, cursor }, ctx),
    runCommand("list_team_members", {}, ctx),
    runCommand("list_customers", {}, ctx),
  ])) as [HistoryPage<OrderChangeRow>, TeamMember[], { id: string; name: string }[]];
  const page = historyPage(changes, "/orders/changes", cursor, { reason: scope.reason, staff: scope.staff, customer: scope.customer });
  return (
    <OrderChangesView
      pagination={page.pagination}
      model={toOrderChangesViewProps({
        backHref: "/more",
        timeZone: brewery.timeZone,
        rows: page.rows,
        staffNames: Object.fromEntries(team.map((m) => [m.userId, m.name])),
        reason: scope.reason ?? "all",
        reasonOptions: scope.reasonOptions(),
        staff: scope.staff ?? "all",
        staffOptions: scope.staffOptions(team.map((m) => ({ id: m.userId, name: m.name }))),
        customer: scope.customer ?? "all",
        customerOptions: scope.customerOptions(customers),
      })}
    />
  );
}
