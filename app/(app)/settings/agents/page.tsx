// app/(app)/settings/agents/page.tsx — the agents connected to this person's account.
// Everyone opens it from the Me sheet, which is not a page, so the back link goes to Today.
import { revokeAgent } from "@/app/(auth)/actions";
import { ConnectedAgentsView } from "@/components/mgr/views/connected-agents";
import { getActiveBrewery } from "@/lib/brewery";
import { toConnectedAgents } from "@/lib/mgr/agent-connect-view";
import { navTitle } from "@/lib/mgr/nav";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: navTitle("/settings/agents") };

export default async function ConnectedAgentsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [brewery, { error }, db] = await Promise.all([getActiveBrewery(), searchParams, createServerClient()]);
  const { data, error: readError } = await db.auth.oauth.listGrants();
  if (readError) throw readError;
  return <ConnectedAgentsView agents={toConnectedAgents(data, brewery.timeZone)} remove={revokeAgent} backHref="/"
    error={error ? "That agent could not be removed. Try again." : undefined} />;
}
