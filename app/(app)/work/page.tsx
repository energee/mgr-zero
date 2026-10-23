// app/(app)/work/page.tsx — Work: everything currently in motion, ordered by
// next due action (list_work). The role's default chips show first; the chip
// bar and its memory are work-list.tsx. New order is size="sm" like every Work
// list's create button, so the tab strip sits at the same height (#1226).
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { workHrefsFor } from "@/components/mgr/work-tabs";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { defaultWorkKinds, type WorkRow } from "@/lib/commands/landings";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { WorkList } from "./work-list";
import { navTitle } from "@/lib/mgr/nav";

export const metadata = { title: navTitle("/work") };

export default async function WorkPage() {
  const brewery = await getActiveBrewery();
  const rows = (await runCommand("list_work", {}, await buildContext(brewery.id))) as WorkRow[];
  const canCreate = brewery.roles.includes("admin") || brewery.roles.includes("sales");
  return (
    <WorkList
      rows={rows} defaults={defaultWorkKinds(brewery.roles)}
      chips={Object.keys(workHrefsFor(brewery.roles))}
      createAction={canCreate ? <Button size="sm" variant="outline" asChild><Link href="/orders/new">New order</Link></Button> : null}
    />
  );
}
