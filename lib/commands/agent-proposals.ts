// lib/commands/agent-proposals.ts — a person's side of an agent's proposal: list,
// approve, decline. A proposal holds a command and its input, so one flow serves
// every command. Approving runs it through runCommand on the person's session.
import { z } from "zod";
import { CommandError, completeRows, defineCommand, defineQuery, listTools, PAGE_SIZE, runCommand, STAFF_ROLES, unwrap } from "./registry";

const proposalId = z.uuid().describe("The proposal, from propose_command");

/** Checked when proposing and again at approval: a token can store any name by calling the RPC directly. */
export function isProposable(name: string) {
  const command = listTools().find(tool => tool.name === name);
  return command?.kind === "command" && command.scope === "tenant" && !command.agentHidden;
}

type ProposalRow = { status: string; expires_at: string };

/** Expiry is derived, so nothing has to run when a proposal's time passes. */
const shownStatus = ({ status, expires_at }: ProposalRow) =>
  status === "pending" && new Date(expires_at) <= new Date() ? "expired" : status;

defineQuery({
  name: "get_proposal_status",
  description: "Whether a proposed change is waiting, was approved or declined, and why it failed if it did",
  input: z.object({ proposalId }),
  roles: STAFF_ROLES,
  handler: async (ctx, { proposalId: id }) => {
    const row = await unwrap(ctx.db.from("agent_proposals").select("command, status, failure, expires_at").eq("id", id).maybeSingle());
    if (!row) throw new CommandError("No such proposal.", 404, "not_found");
    return { command: row.command, status: shownStatus(row), failure: row.failure, expiresAt: row.expires_at };
  },
});

defineQuery({
  name: "list_agent_proposals",
  description: "The changes your agents have proposed that are still waiting for your approval",
  input: z.object({}),
  roles: STAFF_ROLES,
  handler: (ctx) => completeRows("Proposal list", start => ctx.db.from("agent_proposals")
    .select("id, client_id, command, input, created_at, expires_at", { count: "exact" })
    .eq("brewery_id", ctx.breweryId).eq("status", "pending").gt("expires_at", new Date().toISOString())
    .order("created_at").order("id").range(start, start + PAGE_SIZE - 1)),
});

defineCommand({
  name: "approve_agent_proposal",
  description: "Approve a change your agent proposed, which runs it now as you",
  input: z.object({ proposalId }),
  roles: STAFF_ROLES,
  agentHidden: true,
  handler: async (ctx, { proposalId: id }, execution) => {
    const proposal = await unwrap(ctx.db.rpc("begin_agent_proposal", { p_brewery: ctx.breweryId, p_proposal: id })) as { command: string; input: unknown; requestId: string };
    try {
      if (!isProposable(proposal.command)) throw new CommandError("Agents cannot propose this change.", 403, "agent_not_allowed");
      await runCommand(proposal.command, proposal.input, ctx, { requestId: proposal.requestId, correlationId: execution.correlationId });
    } catch (error) {
      // An unexpected error leaves it `approved`: the command may have committed, so `failed` could be false.
      if (!(error instanceof CommandError)) throw error;
      await unwrap(ctx.db.rpc("finish_agent_proposal", { p_proposal: id, p_status: "failed", p_failure: error.message }));
      return { status: "failed", failure: error.message };
    }
    await unwrap(ctx.db.rpc("finish_agent_proposal", { p_proposal: id, p_status: "committed" }));
    return { status: "committed" };
  },
});

defineCommand({
  name: "decline_agent_proposal",
  description: "Decline a change your agent proposed, so it never runs",
  input: z.object({ proposalId }),
  roles: STAFF_ROLES,
  agentHidden: true,
  handler: async (ctx, { proposalId: id }) => {
    await unwrap(ctx.db.rpc("decline_agent_proposal", { p_proposal: id }));
    return { status: "declined" };
  },
});
