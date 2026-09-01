// lib/supabase/admin.ts — service-role client; ONLY for tests/seeding/provisioning/invites. Never in ordinary request paths.
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env/server";

export function createAdminClient() {
  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false },
  });
}
