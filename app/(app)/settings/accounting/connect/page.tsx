import { E } from "@/components/mgr/e";
import { requireAdminContext } from "@/lib/brewery";
import { isQboConfigured } from "@/lib/qbo";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";
import { QboConnectionAction } from "../qbo-controls";

export default async function ConnectQuickBooksPage() {
  const { ctx } = await requireAdminContext("Connect QuickBooks");
  const health = await runCommand("get_qbo_connection", {}, ctx) as { connectionId?: string };
  return <>
    {E.back("Accounting", "Connect QuickBooks", undefined, "/settings/accounting")}
    {E.info("MGR reads customers, items, invoice status and payments. It creates wholesale invoices and credit memos.")}
    {E.note("QuickBooks remains the accounting record. Connecting does not push existing invoices.")}
    <QboConnectionAction configured={isQboConfigured()} reconnect={Boolean(health.connectionId)} />
  </>;
}
