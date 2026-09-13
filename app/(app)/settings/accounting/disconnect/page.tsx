import { DisconnectQuickBooksView } from "@/components/mgr/views/accounting";
import { PosRouteSheet as AccountingRouteSheet } from "@/components/mgr/views/pos-controls";
import { requireAdminContext } from "@/lib/brewery";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { QboDisconnectAction } from "../qbo-controls";

type Health = { connected: boolean; connectionId?: string; state: string };
export default async function DisconnectQuickBooksPage() {
  const { ctx } = await requireAdminContext("Disconnect QuickBooks");
  const health = await runCommand("get_qbo_connection", {}, ctx) as Health;
  return <AccountingRouteSheet title="Disconnect QuickBooks" backHref="/settings/accounting">{health.connected && health.connectionId ? <QboDisconnectAction connectionId={health.connectionId} /> : <DisconnectQuickBooksView connected={false} recoveryRequired={health.state === "recovery_required"} />}</AccountingRouteSheet>;
}
