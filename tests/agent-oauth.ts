// tests/agent-oauth.ts — connects a test agent through Supabase's real OAuth flow,
// for suites that need a genuine agent token.
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { admin } from "./helpers";

export const API = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const REDIRECT = "http://127.0.0.1:9/callback";

export const client = (accessToken?: string) => createClient<Database>(API, ANON, {
  auth: { persistSession: false },
  ...(accessToken ? { accessToken: async () => accessToken } : {}),
});

/** Runs the real authorization-code flow: register a client, approve as the person, exchange the code. */
export async function connectAgent(email: string) {
  const { data: registered, error } = await admin.auth.admin.oauth.createClient({ client_name: "Test agent", redirect_uris: [REDIRECT] });
  if (error || !registered) throw error ?? new Error("no client");
  const person = client();
  const signedIn = await person.auth.signInWithPassword({ email, password: "test-password-1" });
  if (signedIn.error) throw signedIn.error;

  const verifier = randomBytes(32).toString("base64url");
  const authorize = await fetch(`${API}/auth/v1/oauth/authorize?${new URLSearchParams({
    response_type: "code", client_id: registered.client_id, redirect_uri: REDIRECT, scope: "email",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
  })}`, { redirect: "manual" });
  const authorizationId = new URL(authorize.headers.get("location")!).searchParams.get("authorization_id")!;
  // Reading the details binds the request to this person; approval fails without it.
  await person.auth.oauth.getAuthorizationDetails(authorizationId);
  const approved = await person.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (approved.error) throw approved.error;

  const requestToken = async (grant: Record<string, string>) => {
    const response = await fetch(`${API}/auth/v1/oauth/token`, {
      method: "POST",
      headers: {
        apikey: ANON, "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${registered.client_id}:${registered.client_secret}`).toString("base64")}`,
      },
      body: new URLSearchParams(grant),
    });
    return await response.json() as { access_token: string; refresh_token: string };
  };
  const issued = await requestToken({ grant_type: "authorization_code", code: new URL(approved.data.redirect_url).searchParams.get("code")!, redirect_uri: REDIRECT, code_verifier: verifier });
  return {
    token: issued.access_token,
    clientId: registered.client_id,
    userId: signedIn.data.user.id,
    refresh: async () => (await requestToken({ grant_type: "refresh_token", refresh_token: issued.refresh_token })).access_token,
    revoke: () => person.auth.oauth.revokeGrant({ clientId: registered.client_id }),
  };
}
