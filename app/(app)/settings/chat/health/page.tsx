// app/(app)/settings/chat/health/page.tsx — Redacted connection and delivery health with local disable and OAuth recovery.
import { ChatHealthView } from "@/components/mgr/views/chat";
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
  return <ChatHealthView health={health} configured={configured} backHref="/settings/chat" disconnectHref="/settings/chat/disconnect"
    connection={i ? <ChatConnectionAction installationId={i.id} configured={configured} /> : null}
    disable={i ? <ChatDisable installationId={i.id} /> : null} />;
}
