// lib/supabase/admin.ts — service-role client; imports are restricted to the narrow boundaries named in architecture rule 4.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env/server";

export function createAdminClient() {
  const serverEnv = getServerEnv();
  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false },
  });
}
