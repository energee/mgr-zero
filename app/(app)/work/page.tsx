// app/(app)/work/page.tsx — Work: everything currently in motion, ordered by
// next due action (list_work). The role's default chips show first; the chip
// bar and its memory are work-list.tsx.
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { DEFAULT_WORK_KINDS, type WorkRow } from "@/lib/commands/landings";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { WorkList } from "./work-list";

export default async function WorkPage() {
  const brewery = await getActiveBrewery();
  const rows = (await runCommand("list_work", {}, await buildContext(brewery.id))) as WorkRow[];
  return (
    <>
      {E.hd("Work", `${brewery.role} default`, brewery.role === "admin" || brewery.role === "sales" ? E.btn("New order", "g", "/orders") : undefined)}
      <WorkList rows={rows} defaults={DEFAULT_WORK_KINDS[brewery.role] ?? []} />
    </>
  );
}
