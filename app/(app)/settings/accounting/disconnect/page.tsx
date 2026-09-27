import { DisconnectQuickBooksView } from "@/components/mgr/views/accounting";
import { PosRouteSheet as AccountingRouteSheet } from "@/components/mgr/views/pos-controls";
import { requireAdminContext } from "@/lib/brewery";
import { disconnectStatus, type DisconnectHealth } from "@/lib/mgr/integration-disconnect";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { QboDisconnectAction } from "../qbo-controls";

export default async function DisconnectQuickBooksPage() {
  const { ctx } = await requireAdminContext("Disconnect QuickBooks");
  const health = await runCommand("get_qbo_connection", {}, ctx) as DisconnectHealth;
  const status = disconnectStatus(health);
  return <AccountingRouteSheet title="Disconnect QuickBooks" backHref="/settings/accounting">{status === "available" && health.connectionId ? <QboDisconnectAction connectionId={health.connectionId} /> : <DisconnectQuickBooksView status={status} />}</AccountingRouteSheet>;
}
