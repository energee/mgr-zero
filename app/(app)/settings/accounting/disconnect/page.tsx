import { E } from "@/components/mgr/e";
import { requireAdminContext } from "@/lib/brewery";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { QboDisconnectAction } from "../qbo-controls";

type Health = { connected: boolean; connectionId?: string };
export default async function DisconnectQuickBooksPage() {
  const { ctx } = await requireAdminContext("Disconnect QuickBooks");
  const health = await runCommand("get_qbo_connection", {}, ctx) as Health;
  return <>
    {E.back("Accounting", "Disconnect QuickBooks", undefined, "/settings/accounting")}
    {E.note("Stops: invoice push, payment links and payment-status sync.")}
    {E.info("Stays: MGR invoices and their QuickBooks history. Reconnecting the same company restores its mappings; a different company clears them.")}
    {health.connected && health.connectionId ? <QboDisconnectAction connectionId={health.connectionId} /> : E.info("QuickBooks is already disconnected.")}
  </>;
}
