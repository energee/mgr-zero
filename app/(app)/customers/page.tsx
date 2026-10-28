// app/(app)/customers/page.tsx — Customers (screen record): every account
// with its type, state and channel, each opening Customer detail; Add
// customer opens customer-form.tsx. Customer detail owns portal-user invites.
// ?q= narrows list_customers by name or alias, as Catalog's search does.
import { z } from "zod";
import { CustomersView } from "@/components/mgr/views/customers";
import { toCustomersViewProps } from "@/lib/mgr/customers-view";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { CustomerForm } from "./customer-form";
import { ListControls } from "@/components/mgr/list-controls";
import { listParams } from "@/lib/mgr/list-params";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/customers") };

type SaleChannel = { id: string; name: string };
type Customer = { id: string; name: string; alias: string | null; type: string; country: string; state: string | null; payment_terms: string; sale_channels: { name: string } };

const customersParams = z.object({
  q: z.string().trim().max(100).catch(""),
  missingEmail: z.string().catch(""),
});

export default async function CustomersPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const { params, queryWith } = listParams(customersParams, (await searchParams) ?? {});
  const missingPortalEmail = params.missingEmail === "1";
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const [customers, channels] = (await Promise.all([runCommand("list_customers", { missingPortalEmail, q: params.q }, ctx), runCommand("list_sale_channels", {}, ctx)])) as [Customer[], SaleChannel[]];
  // The search form resubmits only q, so it carries ?missingEmail along.
  const keep = Object.fromEntries(queryWith({ q: "" }));
  const canWrite = brewery.roles.includes("admin") || brewery.roles.includes("sales");
  return <CustomersView
    model={toCustomersViewProps({ customers, missingPortalEmail, filtered: Boolean(params.q) })}
    createAction={canWrite ? <CustomerForm channels={channels} /> : null}
    search={customers.length || params.q ? <ListControls search={{ label: "Search customers", value: params.q, keep, path: "/customers" }} /> : undefined}
    linkRows
    backHref="/more"
  />;
}
