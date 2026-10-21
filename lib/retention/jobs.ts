// lib/retention/jobs.ts — the retention job's service boundary (#766). It has no
// user session. Its service access here is the one prune RPC, which removes only
// finished command replay records older than 90 days that nothing references.
// The same route also runs reapQboOAuthExchanges (#1034), which lives with the
// other QuickBooks credential code in lib/supabase/integration-tokens.ts.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function pruneCommandRequests(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("prune_command_requests");
  if (error) throw new Error(`retention prune failed: ${error.message}`);
  return data;
}
