import { E } from "@/components/mgr/e";
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
  return <>
    {E.back("Accounting", "QuickBooks mappings", undefined, "/settings/accounting")}
    {!health.connected ? E.note("Connect QuickBooks before saving mappings.") : E.info(`Mappings are bound to ${health.realmLabel ?? "the verified QuickBooks company"}. Verify each record there; MGR never chooses automatically from a matching name.`)}
    {E.ttl("Customers")}
    {customers.length ? customers.map(row => <div key={row.id}>{E.row(row.name, row.qbo_customer_id ? `QuickBooks customer ${row.qbo_customer_id}` : "Not mapped", health.connected ? <QboMappingForm kind="customer" localId={row.id} label={row.name} currentId={row.qbo_customer_id} /> : "", row.qbo_customer_id ? "ok" : "w")}</div>) : E.blank("No customers yet")}
    {E.ttl("SKUs")}
    {skus.length ? skus.map(row => <div key={row.id}>{E.row(row.name, row.qbo_item_id ? `QuickBooks item ${row.qbo_item_id}` : "Not mapped", health.connected ? <QboMappingForm kind="item" localId={row.id} label={row.name} currentId={row.qbo_item_id} /> : "", row.qbo_item_id ? "ok" : "w")}</div>) : E.blank("No SKUs yet")}
    {E.ttl("Returnable-keg deposits")}
    {E.row("Deposit and refund item", health.depositItemId ? `QuickBooks item ${health.depositItemId}` : "One verified QuickBooks item for frozen keg charges and refunds", health.connected ? <QboMappingForm kind="deposit" label="returnable-keg deposits" currentId={health.depositItemId} /> : "", health.depositItemId ? "ok" : "w")}
  </>;
}
