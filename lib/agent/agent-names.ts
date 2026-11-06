// lib/agent/agent-names.ts — the names a person's connected agents go by, from their
// OAuth grants. A proposal stores only the client id.
import { createServerClient } from "@/lib/supabase/server";

export async function agentNames(): Promise<(clientId: string) => string> {
  const db = await createServerClient();
  const { data, error } = await db.auth.oauth.listGrants();
  if (error) throw error;
  const names = new Map(data.map(grant => [grant.client.id, grant.client.name]));
  return clientId => names.get(clientId) || "Your agent";
}
