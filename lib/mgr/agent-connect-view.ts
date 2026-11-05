// lib/mgr/agent-connect-view.ts — what a person sees when connecting an outside
// agent, and the list of agents they have connected. Pure: the pages supply
// Supabase's OAuth details and the person's breweries.
import type { OAuthAuthorizationDetails, OAuthGrant } from "@supabase/supabase-js";
import { formatDate } from "@/lib/date-format";

export type AgentConsentModel = {
  clientName: string;
  /** Where the sign-in is sent. A client picks its own name, so this is what a person can trust. */
  destination: string;
  reachable: string[];
  unreachable: string[];
  canApprove: boolean;
};

const UNNAMED = "An unnamed agent";

export function toAgentConsentModel(
  details: { client: Pick<OAuthAuthorizationDetails["client"], "name">; redirect_uri: string },
  breweries: { name: string; agentsEnabled: boolean }[],
): AgentConsentModel {
  const reachable = breweries.filter(b => b.agentsEnabled).map(b => b.name);
  return {
    clientName: details.client.name || UNNAMED,
    destination: new URL(details.redirect_uri).host || details.redirect_uri,
    reachable,
    unreachable: breweries.filter(b => !b.agentsEnabled).map(b => b.name),
    canApprove: reachable.length > 0,
  };
}

export type ConnectedAgent = { clientId: string; name: string; connectedOn: string };

export function toConnectedAgents(grants: OAuthGrant[], timeZone: string): ConnectedAgent[] {
  return grants
    .map(grant => ({
      clientId: grant.client.id,
      name: grant.client.name || UNNAMED,
      connectedOn: formatDate(grant.granted_at, timeZone),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
