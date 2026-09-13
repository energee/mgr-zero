import { QboMappingsView } from "@/components/mgr/views/qbo-mapping";
import { requireAdminContext } from "@/lib/brewery";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { QboMappingForm } from "../qbo-controls";

type Customer = { id: string; name: string; qbo_customer_id: string | null; qbo_realm_id: string | null };
type Sku = { id: string; name: string; qbo_item_id: string | null; qbo_realm_id: string | null };
type Health = { connected: boolean; realmLabel: string | null; depositItemId?: string | null };
export default async function QuickBooksMappingsPage() {
  const { ctx } = await requireAdminContext("Mapping conflict");
  const [health, customers, skus] = await Promise.all([
    runCommand("get_qbo_connection", {}, ctx) as Promise<Health>,
    runCommand("list_customers", {}, ctx) as Promise<Customer[]>,
    runCommand("list_skus", {}, ctx) as Promise<Sku[]>,
  ]);
  return <QboMappingsView title="QuickBooks mappings" backLabel="Accounting" backHref="/settings/accounting" connected={health.connected} company={health.realmLabel} sections={[
    { title: "Customers", empty: "No customers yet", rows: customers.map(row => ({ id: row.id, label: row.name, kind: "customer", currentId: row.qbo_customer_id, action: <QboMappingForm kind="customer" localId={row.id} label={row.name} currentId={row.qbo_customer_id} /> })) },
    { title: "SKUs", empty: "No SKUs yet", rows: skus.map(row => ({ id: row.id, label: row.name, kind: "item", currentId: row.qbo_item_id, action: <QboMappingForm kind="item" localId={row.id} label={row.name} currentId={row.qbo_item_id} /> })) },
    { title: "Returnable-keg deposits", rows: [{ id: "deposit", label: "Deposit and refund item", kind: "deposit", currentId: health.depositItemId, detail: "One verified QuickBooks item for frozen keg charges and refunds", action: <QboMappingForm kind="deposit" label="returnable-keg deposits" currentId={health.depositItemId} /> }] },
  ]} />;
}
