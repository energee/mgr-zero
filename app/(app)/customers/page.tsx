// app/(app)/customers/page.tsx — Customers (screen record): every account
// with its type, state and channel, each opening Customer detail; Add
// customer opens customer-form.tsx. Portal-user invites stay gated until
// Program 11.
import { CustomersView } from "@/components/mgr/views/customers";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toCustomersViewProps } from "@/lib/mgr/customers-view";
import "@/lib/commands/all";
import { CustomerForm } from "./customer-form";

type SaleChannel = { id: string; name: string };
type Customer = { id: string; name: string; type: string; state: string; payment_terms: string; sale_channels: { name: string } };

export default async function CustomersPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [customers, channels] = (await Promise.all([runCommand("list_customers", {}, ctx), runCommand("list_sale_channels", {}, ctx)])) as [Customer[], SaleChannel[]];
  return (
    <CustomersView
      model={toCustomersViewProps({ customers })}
      createAction={<CustomerForm channels={channels.map((c) => ({ id: c.id, name: c.name }))} />}
      search={null}
      linkRows
    />
  );
}
