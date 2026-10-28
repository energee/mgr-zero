import { CustomerDetailForm } from "../customer-detail-form";
import { toCustomerViewProps } from "@/lib/mgr/customer-view";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { getCustomerPageData } from "../customer-data";
import { InviteForm } from "../../settings/team/invite-form";
import type { TaxTreatment } from "../customer-form";
import type { CustomerType } from "@/lib/mgr/enums";
import { ShipToForm } from "../ship-to-form";
import { DeleteCommandButton } from "../../delete-command-button";
import { DeleteCustomerControl } from "@/components/mgr/views/delete-customer";
import { RevokePortalUserControl } from "@/components/mgr/views/revoke-portal-user";
import type { PortalUser } from "@/lib/commands/invites";
import { shipToAddress } from "@/lib/mgr/ship-to-view";
import { navTitle } from "@/lib/mgr/nav";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getCustomerPageData(id);
  return { title: navTitle("/customers") };
}

type Customer = { id: string; name: string; alias: string | null; type: CustomerType; country: string; state: string | null; sale_channel_id: string; license_no: string | null; payment_terms: string; tax_treatment: TaxTreatment | null; sale_channels: { name: string } };
type ShipTo = { id: string; label: string; country: string; address1: string | null; address2: string | null; city: string | null; state: string | null; zip: string | null; is_default: boolean };
type SaleChannel = { id: string; name: string };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brewery, ctx, snapshot } = await getCustomerPageData(id);
  const canWrite = brewery.roles.includes("admin") || brewery.roles.includes("sales");
  const { customer, shipTos } = snapshot as { customer: Customer; shipTos: ShipTo[] };
  const [channels, portalUsers] = (await Promise.all([
    runCommand("list_sale_channels", {}, ctx),
    canWrite ? runCommand("list_customer_users", { customerId: id }, ctx) : [],
  ])) as [SaleChannel[], PortalUser[]];
  return <CustomerDetailForm key={JSON.stringify(customer)} customerId={customer.id} canWrite={canWrite}
    model={toCustomerViewProps({ customer, shipTos, channels, portalUsers, backHref: "/customers" })}
    deleteAction={brewery.roles.includes("admin") ? <DeleteCommandButton control={DeleteCustomerControl} command="delete_customer" input={{ customerId: customer.id }} name={customer.name} redirect="/customers" /> : null}
    detail={{
      shipTos: shipTos.map(s => ({
        key: s.id,
        title: `${s.label}${s.is_default ? " · default" : ""}`,
        detail: shipToAddress(s),
        action: canWrite ? <ShipToForm key={JSON.stringify(s)} customerId={customer.id} customerCountry={customer.country} shipTo={s} shipTos={shipTos} /> : null,
      })),
      addShipTo: canWrite ? <ShipToForm customerId={customer.id} customerCountry={customer.country} shipTos={shipTos} /> : null,
      portalUsers: canWrite ? <InviteForm customerId={customer.id} /> : null,
      revokePortalUser: Object.fromEntries(portalUsers.map(u => [u.userId, <DeleteCommandButton key={u.userId} control={RevokePortalUserControl} command="revoke_customer_user" input={{ customerId: customer.id, userId: u.userId }} name={u.email} redirect={`/customers/${customer.id}`} />])),
      kegHref: `/kegs/customers/${customer.id}`,
      ordersHref: `/orders?customerId=${customer.id}`,
      // canWrite is create_order's roles (admin, sales).
      newOrderHref: canWrite ? `/orders/new?customerId=${customer.id}` : undefined,
    }}
  />;
}
