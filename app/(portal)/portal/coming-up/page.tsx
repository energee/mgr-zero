// app/(portal)/portal/coming-up/page.tsx — Coming up (screen record): the
// brewery's planned batches as brand + week from portal_schedule; a brand
// with nothing on the buyer's wholesale list is flagged. Each row opens Shop
// at that brand. Reached from Shop, not a nav tab.
import { ComingUpView } from "@/components/mgr/views/coming-up";
import { getActiveCustomer } from "@/lib/portal";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toComingUpViewProps, type ScheduleRow } from "@/lib/mgr/coming-up-view";
import "@/lib/commands/all";

export default async function ComingUpPage() {
  const customer = await getActiveCustomer();
  const rows = (await runCommand("portal_schedule", {}, await buildContext(customer.breweryId))) as ScheduleRow[];
  return <ComingUpView model={toComingUpViewProps({ brewery: customer.breweryName, rows })} linkRows />;
}
