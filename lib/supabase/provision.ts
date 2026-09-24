// lib/supabase/provision.ts — the brewery-bootstrap service boundary (architecture
// rule 4, #467). `provision_brewery` is not granted to `authenticated`: a signed-in
// account cannot create breweries through PostgREST. The command layer has already
// verified the session (ctx.userId comes from the verified JWT) and refused a
// dedicated deployment; this passes that actor to the service-only RPC, which
// rechecks the account exists and records the request for replay.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { unwrap, type CommandExecution, type PreTenantCtx } from "@/lib/commands/registry";

export type ProvisionInput = { name: string; timezone: string; ttb?: string | null };

export async function provisionBrewery(ctx: PreTenantCtx, input: ProvisionInput, execution: CommandExecution): Promise<string> {
  return unwrap(createAdminClient().rpc("provision_brewery", {
    p_actor: ctx.userId, p_name: input.name, p_timezone: input.timezone, p_ttb: input.ttb || null, p_request_id: execution.requestId,
  })) as Promise<string>; // Returns the new or replayed brewery id; the RPC never returns null.
}
