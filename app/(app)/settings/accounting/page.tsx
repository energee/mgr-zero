import { E } from "@/components/mgr/e";
import { QuickBooksMark } from "@/components/mgr/brand-icons";
import { requireAdminContext } from "@/lib/brewery";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import { isQboConfigured } from "@/lib/qbo";
import "@/lib/commands/all";
import { QboConnectionAction, QboDefaultsForm } from "./qbo-controls";

type Health = { connected: boolean; connectionId?: string; state: "connected" | "disconnected" | "recovery_required"; realmLabel: string | null; remoteRevocationState?: string; lastError: string | null; accessExpiresAt?: string | null; allowAch?: boolean; allowCard?: boolean };

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const { ctx } = await requireAdminContext("Accounting");
  const [health, params] = await Promise.all([runCommand("get_qbo_connection", {}, ctx) as Promise<Health>, searchParams]);
  const connected = health.connected && health.state === "connected";
  return <>
    {E.back("Settings", "Accounting", undefined, "/settings")}
    {params.connected && E.info("QuickBooks authorization completed for the selected company.")}
    {params.error && E.note("QuickBooks authorization was cancelled or could not finish. The existing connection was not replaced.")}
    {E.row(health.realmLabel ?? "QuickBooks Online", connected ? "connected" : health.state.replaceAll("_", " "), connected ? E.act("Disconnect", "destructive", "/settings/accounting/disconnect") : "", connected ? "ok" : "w", QuickBooksMark)}
    {health.lastError && E.note(`Last connection error: ${health.lastError}`)}
    {!connected ? <QboConnectionAction configured={isQboConfigured()} reconnect={Boolean(health.connectionId)} /> : <>
      {E.fld("Company", health.realmLabel ?? "Verified QuickBooks company")}
      {E.fld("Access", health.accessExpiresAt ? `renews automatically · current token expires ${health.accessExpiresAt.slice(0, 10)}` : "renews automatically")}
      {E.nav("Mappings", "Customers, SKUs and returnable-keg deposits", "", undefined, "/settings/accounting/mappings")}
      {E.ttl("Push defaults")}
      <QboDefaultsForm allowAch={health.allowAch ?? true} allowCard={health.allowCard ?? true} />
    </>}
    {health.remoteRevocationState === "unresolved" && E.note("Local access is disconnected. QuickBooks could not confirm remote revocation; reconnect to continue.")}
    {E.info("QuickBooks remains the accounting record. Connecting does not push existing invoices, and MGR never displays credentials.")}
  </>;
}
