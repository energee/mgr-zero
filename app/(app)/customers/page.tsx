// app/(app)/customers/page.tsx — Customers (screen record): every account
// with its type, state and channel, each opening Customer detail; Add
// customer opens customer-form.tsx. Portal-user invites stay gated until
// Program 11.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { CustomerForm } from "./customer-form";

type SaleChannel = { id: string; name: string };
type Customer = { id: string; name: string; type: string; state: string; payment_terms: string; sale_channels: { name: string } };

export default async function CustomersPage() {
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [customers, channels] = (await Promise.all([runCommand("list_customers", {}, ctx), runCommand("list_sale_channels", {}, ctx)])) as [Customer[], SaleChannel[]];
  return (
    <>
      {E.back("More", "Customers", <CustomerForm channels={channels.map((c) => ({ id: c.id, name: c.name }))} />, "/more")}
      {customers.length === 0
        ? E.blank("No customers yet")
        : customers.map((c) => (
            <div key={c.id}>{E.row(c.name, `${c.type} · ${c.state} · ${c.sale_channels.name} · ${c.payment_terms}`, E.act("Open", "primary", `/customers/${c.id}`))}</div>
          ))}
    </>
  );
}
