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
import { DeleteShipToControl } from "@/components/mgr/views/delete-ship-to";
import { RevokePortalUserControl } from "@/components/mgr/views/revoke-portal-user";
import type { PortalUser } from "@/lib/commands/invites";
import { shipToAddress } from "@/lib/mgr/ship-to-view";
import { navTitle } from "@/lib/mgr/nav";
import { invoicesHref, unpaidBalance, type InvoiceListRecord } from "@/lib/mgr/invoices-view";
import type { HistoryPage, HistoryRow } from "@/lib/mgr/history-page";
import type { Ctx } from "@/lib/commands/registry";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await getCustomerPageData(id);
  return { title: navTitle("/customers") };
}

type Customer = { id: string; name: string; alias: string | null; type: CustomerType; country: string; state: string | null; sale_channel_id: string; license_no: string | null; payment_terms: string; tax_treatment: TaxTreatment | null; sale_channels: { name: string } };
type ShipTo = { id: string; label: string; country: string; address1: string | null; address2: string | null; city: string | null; state: string | null; zip: string | null; is_default: boolean };
type SaleChannel = { id: string; name: string };

/** Every unpaid invoice of the customer, page by page, so the open balance never sums a truncated list. */
async function unpaidInvoices(customerId: string, ctx: Ctx) {
  const rows: InvoiceListRecord[] = [];
  let cursor: string | undefined;
  do {
    const page = await runCommand("list_invoices", { customerId, status: "unpaid", limit: 200, cursor }, ctx) as HistoryPage<InvoiceListRecord & HistoryRow>;
    rows.push(...page.rows);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return rows;
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { brewery, ctx, snapshot } = await getCustomerPageData(id);
  const canWrite = brewery.roles.includes("admin") || brewery.roles.includes("sales");
  const { customer, shipTos } = snapshot as { customer: Customer; shipTos: ShipTo[] };
  // Open balance is Admin and Sales only, like the Invoices register's money (#1585).
  const [channels, portalUsers, unpaid] = (await Promise.all([
    runCommand("list_sale_channels", {}, ctx),
    canWrite ? runCommand("list_customer_users", { customerId: id }, ctx) : [],
    canWrite ? unpaidInvoices(id, ctx) : null,
  ])) as [SaleChannel[], PortalUser[], InvoiceListRecord[] | null];
  return <CustomerDetailForm key={JSON.stringify(customer)} customerId={customer.id} canWrite={canWrite}
    model={toCustomerViewProps({ customer, shipTos, channels, portalUsers, openBalance: unpaid ? unpaidBalance(unpaid) : undefined, backHref: "/customers" })}
    deleteAction={brewery.roles.includes("admin") ? <DeleteCommandButton control={DeleteCustomerControl} command="delete_customer" input={{ customerId: customer.id }} name={customer.name} redirect="/customers" /> : null}
    detail={{
      shipTos: shipTos.map(s => ({
        key: s.id,
        title: `${s.label}${s.is_default ? " · default" : ""}`,
        detail: shipToAddress(s),
        action: canWrite ? <ShipToForm key={JSON.stringify(s)} customerId={customer.id} customerCountry={customer.country} shipTo={s} shipTos={shipTos} /> : null,
        // delete_ship_to refuses the default (make another the default first, #1487), so it offers no Delete.
        remove: canWrite && !s.is_default ? <DeleteCommandButton control={DeleteShipToControl} command="delete_ship_to" input={{ shipToId: s.id }} name={s.label} redirect={`/customers/${customer.id}`} /> : null,
      })),
      addShipTo: canWrite ? <ShipToForm customerId={customer.id} customerCountry={customer.country} shipTos={shipTos} /> : null,
      portalUsers: canWrite ? <InviteForm customerId={customer.id} /> : null,
      revokePortalUser: Object.fromEntries(portalUsers.map(u => [u.userId, <DeleteCommandButton key={u.userId} control={RevokePortalUserControl} command="revoke_customer_user" input={{ customerId: customer.id, userId: u.userId }} name={u.email} redirect={`/customers/${customer.id}`} />])),
      kegHref: `/kegs/customers/${customer.id}`,
      ordersHref: `/orders?customerId=${customer.id}`,
      invoicesHref: invoicesHref(customer.id, "unpaid"),
      // canWrite is create_order's roles (admin, sales).
      newOrderHref: canWrite ? `/orders/new?customerId=${customer.id}` : undefined,
    }}
  />;
}
