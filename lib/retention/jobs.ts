// lib/retention/jobs.ts — the retention job's service boundary (#766). It has no
// user session; its service access is the one prune RPC, which removes only
// finished command replay records older than 90 days that nothing references.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function pruneCommandRequests(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("prune_command_requests");
  if (error) throw new Error(`retention prune failed: ${error.message}`);
  return data;
}
