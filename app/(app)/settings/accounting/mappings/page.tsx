import { QboMappingsView } from "@/components/mgr/views/qbo-mapping";
import { qboCompanyName, qboMappingScopeOptions, type QboMappingScope } from "@/lib/mgr/accounting-view";
import { requireAdminContext } from "@/lib/brewery";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { QboMappingForm } from "../qbo-controls";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/settings/accounting/mappings") };

type Customer = { id: string; name: string; qbo_customer_id: string | null; qbo_realm_id: string | null };
type Sku = { id: string; name: string; qbo_item_id: string | null; qbo_realm_id: string | null };
type Vendor = { id: string; name: string; qbo_vendor_id: string | null; qbo_realm_id: string | null };
type Health = { connected: boolean; realmLabel: string | null; realmId?: string; depositItemId?: string | null; oneWayFeeItemId?: string | null; purchaseAccountId: string | null };
/** ?show=unmapped keeps only rows with no QuickBooks id in the connected company (#1515).
 *  The unmapped lists always load: they are the Unmapped (N) count, and that scope's rows. */
export default async function QuickBooksMappingsPage({ searchParams }: { searchParams: Promise<{ show?: string | string[] }> }) {
  const [{ ctx }, params] = await Promise.all([requireAdminContext("Map to QuickBooks"), searchParams]);
  const scope: QboMappingScope = params.show === "unmapped" ? "unmapped" : "all";
  const lists = (input: { unmapped?: true }) => Promise.all([
    runCommand("list_customers", input, ctx) as Promise<Customer[]>,
    runCommand("list_skus", input, ctx) as Promise<Sku[]>,
    runCommand("list_vendors", input, ctx) as Promise<Vendor[]>,
  ]);
  const unmappedLists = lists({ unmapped: true });
  const [health, unmapped, [customers, skus, vendors]] = await Promise.all([
    runCommand("get_qbo_connection", {}, ctx) as Promise<Health>,
    unmappedLists,
    scope === "all" ? lists({}) : unmappedLists,
  ]);
  // The three brewery-wide items are one value each on the connection, not a list to query.
  const brewerywide = [
    { title: "Receipt Bills", rows: [{ id: "purchase_account", label: "Purchase account", kind: "purchase_account" as const, currentId: health.purchaseAccountId, detail: "One brewery-wide QuickBooks account for receipt Bills", action: <QboMappingForm kind="purchase_account" label="receipt Bill purchase account" currentId={health.purchaseAccountId} /> }] },
    { title: "Returnable-keg deposits", rows: [{ id: "deposit", label: "Deposit and refund item", kind: "deposit" as const, currentId: health.depositItemId, detail: "One verified QuickBooks item for frozen keg charges and refunds", action: <QboMappingForm kind="deposit" label="returnable-keg deposits" currentId={health.depositItemId} /> }] },
    { title: "One-way kegs", rows: [{ id: "one_way_fee", label: "One-way keg fee item", kind: "one_way_fee" as const, currentId: health.oneWayFeeItemId, detail: "One verified QuickBooks item for the non-refundable one-way keg fee", action: <QboMappingForm kind="one_way_fee" label="one-way keg fees" currentId={health.oneWayFeeItemId} /> }] },
  ];
  const unmappedBrewerywide = brewerywide.filter(section => !section.rows[0].currentId);
  const unmappedCount = unmapped.reduce((sum, rows) => sum + rows.length, unmappedBrewerywide.length);
  const empty = (noun: string, one: string) => scope === "all" ? `No ${noun} yet` : `Every ${one} is mapped`;
  return <QboMappingsView title="QuickBooks mappings" backLabel="Accounting" backHref="/settings/accounting" connected={health.connected} company={qboCompanyName(health)}
    scope={{ value: scope, options: qboMappingScopeOptions(unmappedCount, true) }} sections={[
    { title: "Customers", empty: empty("customers", "customer"), rows: customers.map(row => ({ id: row.id, label: row.name, kind: "customer", currentId: row.qbo_customer_id, action: <QboMappingForm kind="customer" localId={row.id} label={row.name} currentId={row.qbo_customer_id} /> })) },
    { title: "SKUs", empty: empty("SKUs", "SKU"), rows: skus.map(row => ({ id: row.id, label: row.name, kind: "item", currentId: row.qbo_item_id, action: <QboMappingForm kind="item" localId={row.id} label={row.name} currentId={row.qbo_item_id} /> })) },
    { title: "Vendors", empty: empty("vendors", "vendor"), rows: vendors.map(row => {
      const currentId = row.qbo_realm_id === health.realmId ? row.qbo_vendor_id : null;
      return { id: row.id, label: row.name, kind: "vendor", currentId, action: <QboMappingForm kind="vendor" localId={row.id} label={row.name} currentId={currentId} /> };
    }) },
    ...(scope === "all" ? brewerywide : unmappedBrewerywide),
  ]} />;
}
