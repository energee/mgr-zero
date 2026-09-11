import { requireAdminContext } from "@/lib/brewery";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { isSquareConfigured } from "@/lib/pos";
import "@/lib/commands/all";
import { SquareConnectControl } from "@/components/mgr/views/pos-controls";

export default async function ConnectSquarePage() {
  const { ctx } = await requireAdminContext("Connect Square");
  const health = await runCommand("get_pos_integration_health", {}, ctx) as { connectionId?: string };
  return <SquareConnectControl configured={isSquareConfigured()} reconnect={Boolean(health.connectionId)} />;
}
