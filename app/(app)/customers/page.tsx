// app/(app)/customers/page.tsx — Customers (screen record): every account
// with its type, state and channel, each opening Customer detail; Add
// customer opens customer-form.tsx. Customer detail owns portal-user invites.
import { CustomersView } from "@/components/mgr/views/customers";
import { toCustomersViewProps } from "@/lib/mgr/customers-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { CustomerForm } from "./customer-form";

type SaleChannel = { id: string; name: string };
type Customer = { id: string; name: string; type: string; state: string; payment_terms: string; sale_channels: { name: string } };

export default async function CustomersPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [customers, channels] = (await Promise.all([runCommand("list_customers", {}, ctx), runCommand("list_sale_channels", {}, ctx)])) as [Customer[], SaleChannel[]];
  const canWrite = brewery.role === "admin" || brewery.role === "sales";
  return <CustomersView
    model={toCustomersViewProps({ customers })}
    createAction={canWrite ? <CustomerForm channels={channels} /> : null}
    search={null}
    linkRows
    backHref="/more"
  />;
}
