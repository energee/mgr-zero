// app/(app)/settings/chat/health/page.tsx — Redacted connection and delivery health with local disable and OAuth recovery.
import { E } from "@/components/mgr/e";
import { requireAdminContext } from "@/lib/brewery";
import { isChatConfigured } from "@/lib/chat/oauth";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { ChatHealth } from "@/lib/commands/chat";
import "@/lib/commands/all";
import { ChatConnectionAction, ChatDisable } from "../chat-settings-client";

export default async function ChatHealthPage() {
  const { ctx } = await requireAdminContext("Chat health");
  const health = await runCommand("get_chat_integration_health", {}, ctx) as ChatHealth;
  const i = health.installation;
  const configured = isChatConfigured();
  return <>
    {E.back("Chat", "Health", undefined, "/settings/chat")}
    {E.info(i?.state === "active" ? "Slack delivery is enabled. Blocked channels do not receive team digests; eligible personal sends continue." : "Slack delivery is stopped. Your MGR work remains available.")}
    {E.row("Connection", i?.state.replaceAll("_", " ") ?? "Not connected")}
    {E.row("Last successful message from Slack", health.lastCallback ?? "None yet")}
    {E.row("Last successful delivery", health.lastDelivery ?? "None yet")}
    {Object.entries(health.queue).map(([state, count]) => <div key={state}>{E.row(state, `${count} deliveries`)}</div>)}
    {i?.lastError && E.note(`Last provider error: ${i.lastError.replaceAll("_", " ")}`)}
    {i && ["active", "disabled", "needs_reauthorization"].includes(i.state) && <ChatConnectionAction installationId={i.id} configured={configured} />}
    {i && ["active", "needs_reauthorization"].includes(i.state) && <ChatDisable installationId={i.id} />}
    {E.btn("Manage delivery", "g", "/settings/chat")}
    {i && E.btn(i.lastError === "credential_delete_failed" ? "Retry credential cleanup" : "Disconnect Slack", "del", "/settings/chat/disconnect")}
  </>;
}
