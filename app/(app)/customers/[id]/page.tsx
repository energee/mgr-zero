// app/(app)/customers/[id]/page.tsx — Customer detail (screen record): one
// account's facts with Edit → customer-form.tsx, its ship-tos with
// ship-to-form.tsx, and links to its keg balance and orders. Portal-user
// invites stay gated until Program 11. An unknown or malformed id renders
// not-found.tsx.
import { CustomerView } from "@/components/mgr/views/customer";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toCustomerViewProps } from "@/lib/mgr/customer-view";
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
    <CustomerView
      model={toCustomerViewProps({ customer, shipTos })}
      headerAction={edit}
      readOnly
      kegHref={`/kegs/customers/${customer.id}`}
      addShipTo={<ShipToForm customerId={customer.id} />}
      shipTos={shipTos.map((s) => ({
        key: s.id,
        title: s.label,
        detail: `${s.address1}${s.address2 ? `, ${s.address2}` : ""} · ${s.city}, ${s.state} ${s.zip}`,
        action: <ShipToForm customerId={customer.id} shipTo={s} />,
      }))}
    />
  );
}
