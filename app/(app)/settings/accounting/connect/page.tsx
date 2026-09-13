import { ConnectQuickBooksView } from "@/components/mgr/views/accounting";
import { requireAdminContext } from "@/lib/brewery";
import { isQboConfigured } from "@/lib/qbo";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { QboConnectionAction } from "../qbo-controls";

export default async function ConnectQuickBooksPage() {
  const { ctx } = await requireAdminContext("Connect QuickBooks");
  const health = await runCommand("get_qbo_connection", {}, ctx) as { connectionId?: string };
  return <ConnectQuickBooksView backHref="/settings" connection={<QboConnectionAction configured={isQboConfigured()} reconnect={Boolean(health.connectionId)} />} />;
}
