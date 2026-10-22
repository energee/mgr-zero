import { formatDateTime } from "@/lib/date-format";
import { money } from "@/lib/mgr/money";
import type { PosSaleRow } from "@/lib/mgr/pos-view";
import { PointOfSaleView } from "@/components/mgr/views/pos";
import { requireAdminContext } from "@/lib/brewery";
import { disconnectStatus, type DisconnectHealth } from "@/lib/mgr/integration-disconnect";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { SquareSyncControls } from "@/components/mgr/views/pos-controls";

type Health = DisconnectHealth & { connected: boolean; merchantLabel: string | null; lastError: string | null; salesSyncedThrough?: string | null };
type Location = { mgrLocationId: string | null };
type Sale = { id: string; factKind: "sale" | "return"; itemName: string; variationName: string; locationName: string; soldAt: string; current: boolean; sourceVersion: string; grossCents: number | null; mappingStatus: PosSaleRow["status"] };
type Coverage = { complete: boolean; external_location_id: string; starts_at: string; ends_at: string };
type Facts = { sales: Sale[]; coverage: Coverage[] };

export default async function PosPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const oauthFailed = (await searchParams).error === "oauth";
  const { brewery, ctx } = await requireAdminContext("Point of sale");
  const health = await runCommand("get_pos_integration_health", {}, ctx) as Health;
  const [locations, facts] = health.connected ? await Promise.all([
    runCommand("list_pos_locations", {}, ctx) as Promise<Location[]>,
    runCommand("list_pos_sales", {}, ctx) as Promise<Facts>,
  ]) : [[], { sales: [], coverage: [] }];
  const sales: PosSaleRow[] = facts.sales.map(row => ({
    id: row.id, label: `${row.factKind === "return" ? "Return" : "Sale"} · ${row.itemName} · ${row.variationName}`,
    detail: `${row.locationName} · ${formatDateTime(row.soldAt, brewery.timeZone)} · ${row.current ? "current revision" : `revision ${row.sourceVersion}`}`,
    amount: row.grossCents == null ? "No amount" : money(row.grossCents), status: row.mappingStatus,
    href: `/settings/pos/sales/${row.id}`,
  }));
  const coverage = facts.coverage.filter(row => row.complete).map(row =>
    `${row.external_location_id} · ${formatDateTime(row.starts_at, brewery.timeZone)} to ${formatDateTime(row.ends_at, brewery.timeZone)}`,
  );
  const mapped = locations.filter(location => location.mgrLocationId).length;
  return <PointOfSaleView sales={sales} coverage={coverage} model={{
    connected: health.connected, canDisconnect: disconnectStatus(health) === "available", merchant: health.merchantLabel ?? "Square seller", state: health.state.replaceAll("_", " "),
    locations: locations.length ? `${mapped} mapped · ${locations.length - mapped} need mapping` : "No locations synced",
    lastSync: health.salesSyncedThrough ? formatDateTime(health.salesSyncedThrough, brewery.timeZone) : "No complete sales coverage yet",
    error: health.lastError, oauthFailed,
  }} syncAction={health.connected ? <SquareSyncControls /> : undefined} paths={{ back: "/settings", connect: "/settings/pos/connect", disconnect: "/settings/pos/disconnect", locations: "/settings/pos/locations", menu: "/menu", connector: "/settings/pos/connector" }} />;
}
