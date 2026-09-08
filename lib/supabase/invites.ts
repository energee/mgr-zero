import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { CommandError, unwrap, type Ctx, type CommandExecution, type StaffRole } from "@/lib/commands/registry";

type InviteInput = { email: string } & ({ role: StaffRole; customerId?: never } | { customerId: string; role?: never });
type InviteClaim = { email: string; authToken: string; userId: string | null; state: string };
type Hooks = { afterAuth?: () => Promise<void> };

// atomic-exempt: Auth and Postgres cannot share a client transaction. The Auth
// trigger durably binds identity before Auth commits; completion locks the ledger.
async function invite(ctx: Ctx, input: InviteInput, execution: CommandExecution, hooks: Hooks) {
  const claim = () => unwrap(ctx.db.rpc("claim_invite_request", {
    p_brewery: ctx.breweryId, p_email: input.email, p_kind: input.role ? "staff" : "customer",
    p_role: input.role ?? null, p_customer: input.customerId ?? null, p_request_id: execution.requestId,
  })) as Promise<InviteClaim>;
  try {
    let request = await claim(); // Database derives the actor and checks current role before Auth.
    if (!request.userId) {
      const { error } = await createAdminClient().auth.admin.inviteUserByEmail(request.email, {
        data: { mgr_invite_token: request.authToken, mgr_invite_kind: input.role ? "staff" : "customer" },
      });
      // Run before reading the saved identity: tests prove losing the Auth
      // response cannot orphan the account, not merely a later membership error.
      if (!error) await hooks.afterAuth?.();
      request = await claim();
      if (!request.userId) throw new CommandError("Invitation could not be sent; retry this request", 502, "invite_failed");
    }
    return await unwrap(ctx.db.rpc("complete_invite_membership", { p_request_id: execution.requestId })) as { userId: string };
  } catch (error) {
    // Best effort only: a disconnected DB must not hide the original failure.
    await Promise.resolve(ctx.db.rpc("record_invite_failure", { p_request_id: execution.requestId })).catch(() => null);
    if (error instanceof CommandError) throw error;
    throw new CommandError("Invitation interrupted; retry this request", 502, "invite_failed");
  }
}

export const inviteStaff = (ctx: Ctx, input: { email: string; role: StaffRole }, execution: CommandExecution, hooks: Hooks = {}) => invite(ctx, input, execution, hooks);
export const inviteCustomerUser = (ctx: Ctx, input: { email: string; customerId: string }, execution: CommandExecution, hooks: Hooks = {}) => invite(ctx, input, execution, hooks);
