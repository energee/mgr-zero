// Entry-only consent page. Route groups do not affect /settings/chat/link.
// It sits outside (app), so it mounts BreweryProvider itself: ChatLinkConsent
// runs consume_chat_link_proof, and without the provider that command posts an
// empty actorId the API rejects 400 (tests/command-context-provider.test.ts).
import { MgrIcon } from "@/components/mgr-icon";
import { E } from "@/components/mgr/e";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { ChatLinkConsentView } from "@/components/mgr/views/chat";
import { ChatLinkConsent } from "@/app/(app)/settings/chat/chat-settings-client";
import { BreweryProvider } from "@/app/(app)/brewery-provider";
import { getActiveBrewery } from "@/lib/brewery";
import { getRequestIdentity } from "@/lib/auth/request-context";
import type { ChatLinkIntent } from "@/lib/commands/chat";
import { buildContext } from "@/lib/commands/context";
import { runPageQuery as runCommand } from "@/lib/mgr/page-query";
import "@/lib/commands/all";

export default async function ChatLinkPage({ searchParams }: { searchParams: Promise<{ proof?: string }> }) {
  const { proof } = await searchParams;
  const [brewery, identity] = await Promise.all([getActiveBrewery(), getRequestIdentity()]);
  const ctx = await buildContext(brewery.id);
  const intent = proof && proof.length <= 256 ? await runCommand("get_chat_link_intent", { proof }, ctx) as ChatLinkIntent | null : null;
  return <EntrySurface>
    {E.hd(<><MgrIcon size={16} className="mr-1 inline" />MGR</>)}
    {intent && proof
      ? <BreweryProvider id={brewery.id} actorId={identity!.userId}><ChatLinkConsent proof={proof} intent={intent} /></BreweryProvider>
      : <ChatLinkConsentView backHref="/settings/chat/preferences" />}
  </EntrySurface>;
}
