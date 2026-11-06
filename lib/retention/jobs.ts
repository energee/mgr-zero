// lib/retention/jobs.ts — the retention job's service boundary (#766). It has no
// user session. Its service access here is two prune RPCs. One removes finished command
// replay records older than 90 days that nothing references. The other removes agent
// sessions and proposals past 90 days.
// The same route also runs reapQboOAuthExchanges (#1034), which lives with the
// other QuickBooks OAuth code in lib/qbo.ts.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function pruneCommandRequests(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("prune_command_requests");
  if (error) throw new Error(`retention prune failed: ${error.message}`);
  return data;
}

export async function pruneAgentHistory(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("prune_agent_history");
  if (error) throw new Error(`agent history prune failed: ${error.message}`);
  return data;
}
