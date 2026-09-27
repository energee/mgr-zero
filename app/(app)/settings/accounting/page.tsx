import { E } from "@/components/mgr/e";
import { AccountingView } from "@/components/mgr/views/accounting";
import { toAccountingViewProps, toQboSyncViewProps, type QboSyncStatus, type QboHealth } from "@/lib/mgr/accounting-view";
import { requireAdminContext } from "@/lib/brewery";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { isQboConfigured } from "@/lib/qbo";
import "@/lib/commands/all";
import { QboConnectionAction, QboDefaultsForm, QboSyncButton } from "./qbo-controls";

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const { brewery, ctx } = await requireAdminContext("Accounting");
  const [health, params, syncStatus] = await Promise.all([runCommand("get_qbo_connection", {}, ctx) as Promise<QboHealth>, searchParams, runCommand("get_qbo_sync_status", {}, ctx) as Promise<QboSyncStatus>]);
  const model = toAccountingViewProps(health);
  model.backHref = "/settings"; model.disconnectHref = "/settings/accounting/disconnect";
  model.mappingsHref = "/settings/accounting/mappings"; model.customersHref = "/customers";
  return <AccountingView model={model}
    sync={<QboSyncButton status={toQboSyncViewProps(syncStatus, brewery.timeZone)} disabled={!model.connected} />}
    connection={<QboConnectionAction configured={isQboConfigured()} reconnect={model.reconnect} />}
    defaults={model.connected && model.defaults ? <QboDefaultsForm {...model.defaults} /> : undefined}
    messages={<>{params.connected && E.info("QuickBooks authorization completed for the selected company.")}{params.error && E.note("QuickBooks authorization was cancelled or could not finish. The existing connection was not replaced.")}</>}
  />;
}
