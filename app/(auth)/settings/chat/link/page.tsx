// Entry-only consent page. Route groups do not affect /settings/chat/link.
import { MgrIcon } from "@/components/mgr-icon";
import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { ChatLinkConsentView } from "@/components/mgr/views/chat";
import { ChatLinkConsent } from "@/app/(app)/settings/chat/chat-settings-client";
import { getActiveBrewery } from "@/lib/brewery";
import type { ChatLinkIntent } from "@/lib/commands/chat";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";

export default async function ChatLinkPage({ searchParams }: { searchParams: Promise<{ proof?: string }> }) {
  const { proof } = await searchParams;
  const brewery = await getActiveBrewery();
  const ctx = await buildContext(brewery.id);
  const intent = proof && proof.length <= 256 ? await runCommand("get_chat_link_intent", { proof }, ctx) as ChatLinkIntent | null : null;
  return <EntrySurface>
    {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
    {intent && proof ? <ChatLinkConsent proof={proof} intent={intent} /> : <ChatLinkConsentView backHref="/settings/chat/preferences" />}
  </EntrySurface>;
}
