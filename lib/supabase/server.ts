import type { Database } from "@/lib/supabase/database";
// lib/supabase/server.ts — cookie-bound client for the logged-in user (RLS applies).
import { createServerClient as createSSR } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env/public";

export async function createServerClient(headers?: Record<string, string>) {
  const store = await cookies();
  return createSSR<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    ...(headers ? { global: { headers } } : {}),
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => all.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
}

/** Check credentials without replacing (or downgrading) the caller's session.
 * The temporary verification session is ended before any password update.
 */
export async function verifyCurrentPassword(email: string, password: string, userId: string): Promise<string | null> {
  const verifier = createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await verifier.auth.signInWithPassword({ email, password });
  if (error) return error.code ?? "reauth_failed";
  const { error: signOutError } = await verifier.auth.signOut({ scope: "local" });
  if (signOutError) return "reauth_failed";
  return data.user?.id === userId ? null : "reauth_failed";
}
