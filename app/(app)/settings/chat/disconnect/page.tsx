// app/(app)/settings/chat/disconnect/page.tsx — Explicit disconnect confirmation and retryable credential cleanup.
import { redirect } from "next/navigation";
import { E } from "@/components/mgr/e";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { deniedHref } from "@/lib/mgr/denied";
import type { ChatHealth } from "@/lib/commands/chat";
import "@/lib/commands/all";
import { ChatDisconnect } from "../chat-settings-client";
export default async function DisconnectChatPage() {
  const brewery = await getActiveBrewery();
  if (brewery.role !== "admin") redirect(deniedHref("Disconnect Slack", ["admin"]));
  const ctx = await buildContext(brewery.id);
  const health = await runCommand("get_chat_integration_health", {}, ctx) as ChatHealth;
  return <>{E.back("Chat", "Disconnect Slack", undefined, "/settings/chat")}{health.installation ? <ChatDisconnect installationId={health.installation.id} cleanupPending={health.installation.lastError === "credential_delete_failed"} /> : E.info("Slack is not connected.")}</>;
}
