// lib/supabase/admin.ts — service-role client; only tests, seeding, provisioning, invites, and the RLS-checking integration-token boundary may use it. Never in ordinary request paths.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";

export function createAdminClient() {
  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false },
  });
}
