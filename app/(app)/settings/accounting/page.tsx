import { E } from "@/components/mgr/e";
import { AccountingView } from "@/components/mgr/views/accounting";
import { toAccountingViewProps, type QboHealth } from "@/lib/mgr/accounting-view";
import { requireAdminContext } from "@/lib/brewery";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { isQboConfigured } from "@/lib/qbo";
import "@/lib/commands/all";
import { QboConnectionAction, QboDefaultsForm } from "./qbo-controls";

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const { ctx } = await requireAdminContext("Accounting");
  const [health, params] = await Promise.all([runCommand("get_qbo_connection", {}, ctx) as Promise<QboHealth>, searchParams]);
  const model = toAccountingViewProps(health);
  model.backHref = "/settings"; model.disconnectHref = "/settings/accounting/disconnect";
  model.mappingsHref = "/settings/accounting/mappings"; model.customersHref = "/customers";
  return <AccountingView model={model}
    connection={<QboConnectionAction configured={isQboConfigured()} reconnect={model.reconnect} />}
    defaults={model.connected && model.defaults ? <QboDefaultsForm {...model.defaults} /> : undefined}
    messages={<>{params.connected && E.info("QuickBooks authorization completed for the selected company.")}{params.error && E.note("QuickBooks authorization was cancelled or could not finish. The existing connection was not replaced.")}</>}
  />;
}
