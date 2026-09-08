// GET only previews identity. The consent control POSTs through the registry.
import { E } from "@/components/mgr/e";
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
  return <>
    {E.back("My preferences", "Link your Slack", undefined, "/settings/chat/preferences")}
    {intent && proof ? <ChatLinkConsent proof={proof} intent={intent} /> : E.info("This link is missing, expired, already used, or belongs to another brewery. Select the right brewery, then open MGR’s App Home in Slack and choose Link MGR account for a fresh link.")}
  </>;
}
