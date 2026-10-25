import "server-only";
import { isAuthApiError, type AuthError } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { CommandError, unwrap, type Ctx, type CommandExecution, type StaffRole } from "@/lib/commands/registry";

type InviteInput = { email: string } & ({ role: StaffRole; customerId?: never } | { customerId: string; role?: never });
type InviteClaim = { id: string; email: string; authToken: string; userId: string | null; state: string };
type Hooks = { afterAuth?: () => Promise<void> };

/** Only documented Auth refusals are definite; transport/server failures may follow a send. */
export function inviteAuthFailure(error: AuthError | null): CommandError {
  if (isAuthApiError(error) && error.status >= 400 && error.status < 500) {
    switch (error.code) {
      case "email_address_invalid":
        return new CommandError("The email service rejected this address. Use a real, deliverable email address; example and test domains may be refused.", 422, "invite_email_invalid");
      case "email_address_not_authorized":
        return new CommandError("The email service does not allow invitations to this address. Ask the deployment owner to configure a custom SMTP provider.", 422, "invite_email_not_authorized");
      case "email_provider_disabled":
        return new CommandError("Email invitations are disabled. Ask the deployment owner to enable email invitations in Auth settings.", 422, "invite_email_disabled");
      case "over_email_send_rate_limit":
      case "over_request_rate_limit":
        return new CommandError("The email service is rate limited. Wait before retrying; ask the deployment owner to check Auth email limits if this continues.", 429, "invite_rate_limited");
    }
  }
  return new CommandError("Invitation outcome could not be confirmed. Retry this saved request; if it keeps failing, contact the deployment owner with the request ID.", 502, "invite_failed");
}

// atomic-exempt: Auth and Postgres cannot share a client transaction. The Auth
// trigger durably binds identity before Auth commits; completion locks the ledger.
async function invite(ctx: Ctx, input: InviteInput, execution: CommandExecution, hooks: Hooks) {
  const claim = () => unwrap(ctx.db.rpc("claim_invite_request", {
    p_brewery: ctx.breweryId, p_email: input.email, p_kind: input.role ? "staff" : "customer",
    p_role: input.role ?? null, p_customer: input.customerId ?? null, p_request_id: execution.requestId,
  })) as Promise<InviteClaim>;
  try {
    let request = await claim(); // Database derives the actor and checks current role before Auth.
    if (request.state === "pending_consent") return { inviteId: request.id, state: request.state };
    if (!request.userId) {
      const { error } = await createAdminClient().auth.admin.inviteUserByEmail(request.email, {
        data: { mgr_invite_token: request.authToken, mgr_invite_kind: input.role ? "staff" : "customer" },
      });
      // Run before reading the saved identity: tests prove losing the Auth
      // response cannot orphan the account, not merely a later membership error.
      if (!error) await hooks.afterAuth?.();
      request = await claim();
      if (!request.userId) {
        const failure = inviteAuthFailure(error);
        // Never log provider messages, addresses, tokens, or credentials.
        console.error("invite Auth failure", { requestId: execution.requestId, correlationId: execution.correlationId, code: failure.code });
        throw failure;
      }
    }
    return await unwrap(ctx.db.rpc("complete_invite_membership", { p_request_id: execution.requestId })) as { userId: string };
  } catch (error) {
    // Best effort only: a disconnected DB must not hide the original failure.
    await Promise.resolve(ctx.db.rpc("record_invite_failure", { p_request_id: execution.requestId })).catch(() => null);
    if (error instanceof CommandError) throw error;
    throw inviteAuthFailure(null);
  }
}

export const inviteStaff = (ctx: Ctx, input: { email: string; role: StaffRole }, execution: CommandExecution, hooks: Hooks = {}) => invite(ctx, input, execution, hooks);
export const inviteCustomerUser = (ctx: Ctx, input: { email: string; customerId: string }, execution: CommandExecution, hooks: Hooks = {}) => invite(ctx, input, execution, hooks);
