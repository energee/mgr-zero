// app/(portal)/portal/coming-up/page.tsx — Coming up (screen record): the
// brewery's planned batches as brand + week from portal_schedule; a brand
// with nothing on the wholesale list is flagged. Each row opens Shop at that
// brand. Reached from Shop, not a nav tab.
import { ComingUpView } from "@/components/mgr/views/coming-up";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toComingUpViewProps, type ScheduleRow } from "@/lib/mgr/coming-up-view";
import "@/lib/commands/all";

export default async function ComingUpPage() {
  const customer = await getActiveCustomer();
  const ctx = await buildContext(customer.breweryId);
  const [rows, catalog, brewery] = (await Promise.all([
    runCommand("portal_schedule", {}, ctx), runCommand("portal_catalog", {}, ctx), ctx.db.from("breweries").select("name").eq("id", customer.breweryId).single(),
  ])) as [ScheduleRow[], { product: string }[], { data: { name: string } | null }];
  return <ComingUpView model={toComingUpViewProps({ brewery: brewery.data?.name ?? "the brewery", rows, listed: new Set(catalog.map((c) => c.product)) })} linkRows />;
}
