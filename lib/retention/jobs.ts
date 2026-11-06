// lib/retention/jobs.ts — the retention job's service boundary (#766). It has no
// user session. Its service access here is three RPCs. One removes finished command
// replay records older than 90 days that nothing references. One removes agent sessions
// and proposals past 90 days. One reads the weekly agent friction counts.
// The same route also runs reapQboOAuthExchanges (#1034), which lives with the
// other QuickBooks OAuth code in lib/qbo.ts.
import "server-only";
import type { FrictionReport } from "@/lib/agent/friction";
import { createAdminClient } from "@/lib/supabase/admin";

export async function pruneCommandRequests(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("prune_command_requests");
  if (error) throw new Error(`retention prune failed: ${error.message}`);
  return data;
}

export async function readFrictionReport(): Promise<FrictionReport> {
  const { data, error } = await createAdminClient().rpc("agent_friction_report");
  if (error) throw new Error(`friction report failed: ${error.message}`);
  return data as unknown as FrictionReport;
}

export async function pruneAgentHistory(): Promise<number> {
  const { data, error } = await createAdminClient().rpc("prune_agent_history");
  if (error) throw new Error(`agent history prune failed: ${error.message}`);
  return data;
}
