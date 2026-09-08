import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
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
  const edit = canWrite && (
    <CustomerForm key={JSON.stringify(customer)} channels={channels.map((c) => ({ id: c.id, name: c.name }))}
      customer={{ id: customer.id, name: customer.name, type: customer.type, state: customer.state, saleChannelId: customer.sale_channel_id, licenseNumber: customer.license_no, paymentTerms: customer.payment_terms, taxTreatment: customer.tax_treatment }} />
  );
  return (
    <>
      {E.back("Customers", customer.name, edit, "/customers")}
      {E.fld("Type", customer.type)}
      {E.fld("State", customer.state)}
      {E.fld("License number", customer.license_no ?? "none")}
      {E.fld("Terms", customer.payment_terms)}
      {E.fld("Tax treatment", customer.tax_treatment?.replaceAll("_", " ") ?? "Inherit sale channel")}
      {E.nav("Orders", "Orders for this customer", "", undefined, `/orders?customerId=${customer.id}`)}
      {E.fld("Sale channel", customer.sale_channels.name)}
      {E.ttl("Ship-tos")}
      {shipTos.map((s) => (
        <div key={s.id}>{E.row(`${s.label}${s.is_default ? " · default" : ""}`, `${s.address1}${s.address2 ? `, ${s.address2}` : ""} · ${s.city}, ${s.state} ${s.zip}`, canWrite ? <ShipToForm key={JSON.stringify(s)} customerId={customer.id} shipTo={s} /> : undefined)}</div>
      ))}
      {canWrite && <ShipToForm customerId={customer.id} />}
      {(brewery.role === "admin" || brewery.role === "sales") && <InviteForm customerId={customer.id} />}
      {E.row("Customer keg balance", "kegs out and deposits held", E.act("Open", "primary", `/kegs/customers/${customer.id}`))}
    </>
  );
}
