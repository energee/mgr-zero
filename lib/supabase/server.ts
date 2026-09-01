// lib/supabase/server.ts — cookie-bound client for the logged-in user (RLS applies).
import { createServerClient as createSSR } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env/public";

export async function createServerClient() {
  const store = await cookies();
  return createSSR(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => all.forEach(({ name, value, options }) => store.set(name, value, options)),
    },
  });
}
