// app/(app)/settings/chat/health/page.tsx — Redacted connection and delivery health with local disable and OAuth recovery.
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { deniedHref } from "@/lib/mgr/denied";
import type { ChatHealth } from "@/lib/commands/chat";
import "@/lib/commands/all";
import { ChatConnectionAction, ChatDisable } from "../chat-settings-client";

export default async function ChatHealthPage() {
  const brewery = await getActiveBrewery();
  if (brewery.role !== "admin") redirect(deniedHref("Chat health", ["admin"]));
  const ctx = await buildContext(brewery.id);
  const health = await runCommand("get_chat_integration_health", {}, ctx) as ChatHealth;
  const i = health.installation;
  const configured = ["APP_URL", "SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET", "SLACK_SIGNING_SECRET", "CHAT_SDK_ENCRYPTION_KEY", "CHAT_STATE_DATABASE_URL"].every((key) => Boolean(process.env[key]));
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
