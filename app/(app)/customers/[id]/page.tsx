// app/(app)/customers/[id]/page.tsx — Customer detail (screen record): one
// account's facts with Edit → customer-form.tsx, its ship-tos with
// ship-to-form.tsx, portal InviteForm for sales/admin, and links to keg
// balance and orders. Warehouse is read-only. An unknown or malformed id
// renders not-found.tsx.
import { CustomerView } from "@/components/mgr/views/customer";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toCustomerViewProps } from "@/lib/mgr/customer-view";
import "@/lib/commands/all";
import { orNotFound } from "@/lib/mgr/not-found";
import { InviteForm } from "../../settings/team/invite-form";
import { CustomerForm, type TaxTreatment } from "../customer-form";
import { ShipToForm } from "../ship-to-form";

type CustomerType = "distributor" | "retailer" | "brewery" | "other";
type Customer = { id: string; name: string; type: CustomerType; state: string; sale_channel_id: string; license_no: string | null; payment_terms: string; tax_treatment: TaxTreatment | null; sale_channels: { name: string } };
type ShipTo = { id: string; label: string; address1: string; address2: string | null; city: string; state: string; zip: string; is_default: boolean };
type SaleChannel = { id: string; name: string };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [{ customer, shipTos }, channels] = (await Promise.all([
    orNotFound(runCommand("get_customer", { customerId: id }, ctx)), runCommand("list_sale_channels", {}, ctx),
  ])) as [{ customer: Customer; shipTos: ShipTo[] }, SaleChannel[]];
  const canWrite = brewery.role === "admin" || brewery.role === "sales";
  const edit = canWrite ? (
    <CustomerForm key={JSON.stringify(customer)} channels={channels.map((c) => ({ id: c.id, name: c.name }))}
      customer={{ id: customer.id, name: customer.name, type: customer.type, state: customer.state, saleChannelId: customer.sale_channel_id, licenseNumber: customer.license_no, paymentTerms: customer.payment_terms, taxTreatment: customer.tax_treatment }} />
  ) : undefined;
  return (
    <CustomerView
      model={toCustomerViewProps({ customer, shipTos, backHref: "/customers" })}
      headerAction={edit}
      detail={{
        kegHref: `/kegs/customers/${customer.id}`,
        addShipTo: canWrite ? <ShipToForm customerId={customer.id} /> : undefined,
        portalUsers: canWrite ? <InviteForm customerId={customer.id} /> : null,
        shipTos: shipTos.map((s) => ({
          key: s.id,
          title: `${s.label}${s.is_default ? " · default" : ""}`,
          detail: `${s.address1}${s.address2 ? `, ${s.address2}` : ""} · ${s.city}, ${s.state} ${s.zip}`,
          action: canWrite ? <ShipToForm customerId={customer.id} shipTo={s} /> : undefined,
        })),
      }}
    />
  );
}
