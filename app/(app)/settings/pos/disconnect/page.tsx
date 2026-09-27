import { DisconnectSquareView } from "@/components/mgr/views/pos";
import { E } from "@/components/mgr/e";
import { requireAdminContext } from "@/lib/brewery";
import { disconnectStatus, type DisconnectHealth } from "@/lib/mgr/integration-disconnect";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { PosRouteSheet, SquareDisconnectControl } from "@/components/mgr/views/pos-controls";

export default async function DisconnectSquarePage() {
  const { ctx } = await requireAdminContext("Disconnect Square");
  const health = await runCommand("get_pos_integration_health", {}, ctx) as DisconnectHealth;
  const status = disconnectStatus(health);
  return <>{E.back("Point of sale", "Disconnect Square", undefined, "/settings/pos")}<PosRouteSheet title="Disconnect Square" backHref="/settings/pos">{status === "available" && health.connectionId ? <SquareDisconnectControl connectionId={health.connectionId} /> : <DisconnectSquareView status={status} />}</PosRouteSheet></>;
}
