// app/(app)/settings/chat/disconnect/page.tsx — Explicit disconnect confirmation and retryable credential cleanup.
import { E } from "@/components/mgr/e";
import { requireAdminContext } from "@/lib/brewery";
import { runCommand } from "@/lib/commands/registry";
import type { ChatHealth } from "@/lib/commands/chat";
import "@/lib/commands/all";
import { ChatDisconnect } from "../chat-settings-client";
export default async function DisconnectChatPage() {
  const { ctx } = await requireAdminContext("Disconnect Slack");
  const health = await runCommand("get_chat_integration_health", {}, ctx) as ChatHealth;
  return <>{E.back("Chat", "Disconnect Slack", undefined, "/settings/chat")}{health.installation ? <ChatDisconnect installationId={health.installation.id} cleanupPending={health.installation.lastError === "credential_delete_failed"} /> : E.info("Slack is not connected.")}</>;
}
