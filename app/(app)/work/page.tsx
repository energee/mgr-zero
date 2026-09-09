// app/(app)/work/page.tsx — Work: everything currently in motion, ordered by
// next due action (list_work). The role's default chips show first; the chip
// bar and its memory are work-list.tsx.
import { E } from "@/components/mgr/e";
import { WorkView } from "@/components/mgr/views/work";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { DEFAULT_WORK_KINDS, type WorkRow } from "@/lib/commands/landings";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { toWorkViewProps } from "@/lib/mgr/work-view";
import "@/lib/commands/all";
import { WorkList } from "./work-list";

export default async function WorkPage() {
  const brewery = await getActiveBrewery();
  const rows = (await runCommand("list_work", {}, await buildContext(brewery.id))) as WorkRow[];
  const canCreate = brewery.role === "admin" || brewery.role === "sales";
  return (
    <WorkView
      model={toWorkViewProps({ subtitle: `${brewery.role} default`, rows: [] })}
      createAction={canCreate ? E.btn("New order", "g", "/orders") : null}
      list={<WorkList rows={rows} defaults={DEFAULT_WORK_KINDS[brewery.role] ?? []} />}
    />
  );
}
