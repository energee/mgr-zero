// app/(app)/customers/[id]/page.tsx — Customer detail (screen record): one
// account's facts with Edit → customer-form.tsx, its ship-tos with
// ship-to-form.tsx, and links to its keg balance and orders. Portal-user
// invites stay gated until Program 11. An unknown or malformed id renders
// not-found.tsx.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { CustomerForm } from "../customer-form";
import { ShipToForm } from "../ship-to-form";

type CustomerType = "distributor" | "retailer" | "brewery" | "other";
type Customer = { id: string; name: string; type: CustomerType; state: string; sale_channel_id: string; license_no: string | null; payment_terms: string; sale_channels: { name: string } };
type ShipTo = { id: string; label: string; address1: string; address2: string | null; city: string; state: string; zip: string };
type SaleChannel = { id: string; name: string };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ customer, shipTos }, channels] = (await Promise.all([
    orNotFound(runCommand("get_customer", { customerId: id }, ctx)), runCommand("list_sale_channels", {}, ctx),
  ])) as [{ customer: Customer; shipTos: ShipTo[] }, SaleChannel[]];
  const edit = (
    <CustomerForm channels={channels.map((c) => ({ id: c.id, name: c.name }))}
      customer={{ id: customer.id, name: customer.name, type: customer.type, state: customer.state, saleChannelId: customer.sale_channel_id, licenseNumber: customer.license_no, paymentTerms: customer.payment_terms }} />
  );
  return (
    <>
      {E.back("Customers", customer.name, edit, "/customers")}
      {E.fld("Type", customer.type)}
      {E.fld("State", customer.state)}
      {E.fld("License number", customer.license_no ?? "none")}
      {E.fld("Terms", customer.payment_terms)}
      {E.fld("Sale channel", customer.sale_channels.name)}
      {E.ttl("Ship-tos")}
      {shipTos.map((s) => (
        <div key={s.id}>{E.row(s.label, `${s.address1}${s.address2 ? `, ${s.address2}` : ""} · ${s.city}, ${s.state} ${s.zip}`, <ShipToForm customerId={customer.id} shipTo={s} />)}</div>
      ))}
      <ShipToForm customerId={customer.id} />
      {E.gated("Portal users", "invitations aren’t available yet")}
      {E.row("Customer keg balance", "kegs out and deposits held", E.act("Open", "primary", `/kegs/customers/${customer.id}`))}
    </>
  );
}
