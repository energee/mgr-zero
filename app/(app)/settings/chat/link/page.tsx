// GET only previews identity. The consent control POSTs through the registry.
import { ChatLinkConsentView } from "@/components/mgr/views/chat";
import { getActiveBrewery } from "@/lib/brewery";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import type { ChatLinkIntent } from "@/lib/commands/chat";
import "@/lib/commands/all";
import { ChatLinkConsent } from "../chat-settings-client";
export default async function ChatLinkPage({ searchParams }: { searchParams: Promise<{ proof?: string }> }) {
  const { proof } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const intent = proof && proof.length <= 256 ? await runCommand("get_chat_link_intent", { proof }, ctx) as ChatLinkIntent | null : null;
  return intent && proof ? <ChatLinkConsent proof={proof} intent={intent} /> : <ChatLinkConsentView backHref="/settings/chat/preferences" />;
}
