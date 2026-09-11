import { requireAdminContext } from "@/lib/brewery";
import { E } from "@/components/mgr/e";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { PosLocationRow } from "@/lib/mgr/pos-view";
import "@/lib/commands/all";
import { PosRouteSheet, SquareLocationsControl } from "@/components/mgr/views/pos-controls";

type ObservedLocation = { externalLocationId: string; name: string | null; status: string | null; available: boolean; mappingLabel: string | null; mgrLocationId: string | null };

export default async function SquareLocationsPage() {
  const { ctx } = await requireAdminContext("Square locations");
  const [observed, locations] = await Promise.all([
    runCommand("list_pos_locations", {}, ctx) as Promise<ObservedLocation[]>,
    runCommand("list_locations", {}, ctx) as Promise<{ id: string; name: string }[]>,
  ]);
  const rows: PosLocationRow[] = observed.map(row => ({
    externalLocationId: row.externalLocationId, name: row.name ?? row.externalLocationId,
    detail: `${row.status ?? "unknown"} · ${row.available ? "available" : "closed"}${row.mappingLabel ? ` · ${row.mappingLabel}` : " · needs mapping"}`,
    mgrLocationId: row.mgrLocationId ?? "",
  }));
  return <>{E.back("Point of sale", "Square locations", undefined, "/settings/pos")}<PosRouteSheet title="Square locations" backHref="/settings/pos"><SquareLocationsControl rows={rows} locations={locations} /></PosRouteSheet></>;
}
