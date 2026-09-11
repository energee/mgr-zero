import { DisconnectSquareView } from "@/components/mgr/views/pos";
import { E } from "@/components/mgr/e";
import { requireAdminContext } from "@/lib/brewery";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { PosRouteSheet, SquareDisconnectControl } from "@/components/mgr/views/pos-controls";

export default async function DisconnectSquarePage() {
  const { ctx } = await requireAdminContext("Disconnect Square");
  const health = await runCommand("get_pos_integration_health", {}, ctx) as { connected: boolean; connectionId?: string };
  return <>{E.back("Point of sale", "Disconnect Square", undefined, "/settings/pos")}<PosRouteSheet title="Disconnect Square" backHref="/settings/pos">{health.connected && health.connectionId ? <SquareDisconnectControl connectionId={health.connectionId} /> : <DisconnectSquareView connected={false} />}</PosRouteSheet></>;
}
