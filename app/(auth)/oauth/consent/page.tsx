// app/(auth)/oauth/consent/page.tsx — Supabase's OAuth server sends a person here
// when an outside agent asks to connect (authorization_url_path in supabase/config.toml).
import { redirect } from "next/navigation";
import "@/lib/commands/all";
import { approveAgent, denyAgent } from "../../actions";
import { EntrySurface } from "@/components/mgr/entry-surface";
import { AgentConsentView } from "@/components/mgr/views/agent-consent";
import { getRequestIdentity } from "@/lib/auth/request-context";
import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { toAgentConsentModel } from "@/lib/mgr/agent-connect-view";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Connect an agent" };

export default async function AgentConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const { authorization_id: authorizationId } = await searchParams;
  const expired = <EntrySurface><AgentConsentView model={null} /></EntrySurface>;
  if (!authorizationId) return expired;
  if (!(await getRequestIdentity())) {
    const consent = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    redirect(`/login?next=${encodeURIComponent(consent)}`);
  }
  const db = await createServerClient();
  // Reading the details also binds the request to this person; approval fails without it.
  const { data, error } = await db.auth.oauth.getAuthorizationDetails(authorizationId);
  // A client error is an expired or unknown request. Anything else is an outage, not "expired".
  if (error && (error.status ?? 500) >= 500) throw error;
  if (error) return expired;
  // Supabase skips consent for a client this person already approved.
  if (!("authorization_id" in data)) redirect(data.redirect_url);
  const breweries = await runCommand("list_my_agent_breweries", {}, await buildContext()) as { name: string; agentsEnabled: boolean }[];
  return <EntrySurface>
    <AgentConsentView model={toAgentConsentModel(data, breweries)} authorizationId={authorizationId} approve={approveAgent} deny={denyAgent} />
  </EntrySurface>;
}
