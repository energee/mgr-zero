import { PointOfSaleView } from "@/components/mgr/views/pos";
import { requireAdminContext } from "@/lib/brewery";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { SquareSyncControls } from "@/components/mgr/views/pos-controls";

type Health = { connected: boolean; state: string; merchantLabel: string | null; lastError: string | null; salesSyncedThrough?: string | null };
type Location = { mgrLocationId: string | null };

export default async function PosPage() {
  const { ctx } = await requireAdminContext("Point of sale");
  const health = await runCommand("get_pos_integration_health", {}, ctx) as Health;
  const locations = health.connected ? await runCommand("list_pos_locations", {}, ctx) as Location[] : [];
  const mapped = locations.filter(location => location.mgrLocationId).length;
  return <PointOfSaleView model={{
    connected: health.connected, merchant: health.merchantLabel ?? "Square seller", state: health.state.replaceAll("_", " "),
    locations: locations.length ? `${mapped} mapped · ${locations.length - mapped} need mapping` : "No locations synced",
    lastSync: health.salesSyncedThrough ? new Date(health.salesSyncedThrough).toLocaleString() : "No complete sales coverage yet",
    error: health.lastError,
  }} syncAction={health.connected ? <SquareSyncControls /> : undefined} live />;
}
