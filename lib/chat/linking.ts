// lib/chat/linking.ts — explicit Slack user → MGR staff linking. The App Home
// handler issues an opaque single-use proof (only its sha256 is stored) and a
// deep link the person completes while authenticated in MGR; every provider
// callback re-resolves the actor from server state via resolveChatActor.
// Both take the caller's client: provider callbacks and jobs pass the
// service-role client (iron rule 4 keeps its construction in the named
// internal-job owner), and the RPCs themselves refuse any other role.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CommandError, unwrap, type StaffRole } from "@/lib/commands/registry";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export type ResolvedChatActor = {
  installationId: string;
  breweryId: string;
  externalUserId: string;
  userId: string;
  role: StaffRole;
};

export async function issueChatLinkProof(db: SupabaseClient, installationId: string, externalUserId: string) {
  const base = process.env.APP_URL;
  if (!base) throw new CommandError("APP_URL is not configured", 500);
  const proof = randomBytes(32).toString("base64url");
  const data = await unwrap(db.rpc("issue_chat_link_proof", {
    p_installation: installationId, p_external_user_id: externalUserId, p_proof_hash: sha256(proof),
  }));
  const { link_id, expires_at } = data as { link_id: string; expires_at: string };
  return { proof, linkId: link_id, expiresAt: expires_at, url: `${base}/settings/chat/link?proof=${encodeURIComponent(proof)}` };
}

export async function resolveChatActor(
  db: SupabaseClient,
  provider: "slack",
  installationExternalId: string,
  externalUserId: string,
): Promise<ResolvedChatActor | null> {
  const data = await unwrap(db.rpc("resolve_chat_actor", {
    p_provider: provider, p_external_installation_id: installationExternalId, p_external_user_id: externalUserId,
  }));
  if (!data) return null;
  const r = data as { installation_id: string; brewery_id: string; external_user_id: string; user_id: string; role: StaffRole };
  return { installationId: r.installation_id, breweryId: r.brewery_id, externalUserId: r.external_user_id, userId: r.user_id, role: r.role };
}
