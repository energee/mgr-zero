// tests/agent-proposals.test.ts — an agent proposes, and only its person commits.
// Drives real agent tokens through /api/mcp, then approves on the person's session.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { POST } from "@/app/api/mcp/route";
import { defineCommand, runCommand, type Ctx } from "@/lib/commands/registry";
import { asUser, makeBrewery, makeStaff, sql } from "./helpers";
import { client, connectAgent } from "./agent-oauth";

async function tool(token: string, name: string, args: Record<string, unknown>) {
  const response = await POST(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  }));
  const text = await response.text();
  const { result } = JSON.parse(text.startsWith("{") ? text : text.split("\n").find(line => line.startsWith("data: "))!.slice(6));
  return { isError: Boolean(result.isError), body: JSON.parse(result.content[0].text) };
}

describe("agent proposals", () => {
  let breweryId: string;
  let person: { email: string; id: string };
  let agent: Awaited<ReturnType<typeof connectAgent>>;
  let ctx: Ctx;
  const handler = vi.fn(async (_ctx: Ctx, input: { note: string }) => {
    if (input.note === "refuse") throw new (await import("@/lib/commands/registry")).CommandError("That is not allowed right now.", 400, "bad_request");
    return { saved: input.note };
  });
  const propose = async (note = "hello") => (await tool(agent.token, "propose_command", { name: "proposal_probe", input: { note } })).body;
  const approve = (proposalId: string, as = ctx) => runCommand("approve_agent_proposal", { proposalId }, as, { requestId: randomUUID(), correlationId: randomUUID() });

  beforeAll(async () => {
    vi.stubEnv("APP_URL", "https://mgr.test");
    breweryId = (await makeBrewery()).id;
    person = await makeStaff(breweryId, "admin");
    agent = await connectAgent(person.email);
    sql(`update public.breweries set agents_enabled = true where id = '${breweryId}'`);
    ctx = { db: await asUser(person.email), userId: person.id, breweryId, roles: ["admin"] };
    defineCommand({ name: "proposal_probe", description: "A command with no code for proposals", input: z.object({ note: z.string() }), roles: ["admin"], handler });
    defineCommand({ name: "proposal_hidden_probe", description: "A command agents may not propose", input: z.object({}), roles: ["admin"], agentHidden: true, handler: async () => ({}) });
  });

  it("stores any registered command, runs nothing, and says where to approve", async () => {
    handler.mockClear();
    const body = await propose();
    expect(body.status).toBe("awaiting_approval");
    expect(body.approveUrl).toContain(`/proposals/${body.proposalId}`);
    expect(handler).not.toHaveBeenCalled();
  });

  it("commits on the person's approval, once, with the proposal's request id", async () => {
    handler.mockClear();
    const { proposalId } = await propose("commit me");
    const result = await approve(proposalId) as { status: string };
    expect(result.status).toBe("committed");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1]).toEqual({ note: "commit me" });
    await expect(approve(proposalId)).rejects.toMatchObject({ code: "conflict" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect((await tool(agent.token, "run_query", { name: "get_proposal_status", input: { proposalId } })).body.data.status).toBe("committed");
  });

  it("commits once when two approvals race", async () => {
    handler.mockClear();
    const { proposalId } = await propose("race");
    const results = await Promise.allSettled([approve(proposalId), approve(proposalId)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("refuses bad input when proposing", async () => {
    const { isError, body } = await tool(agent.token, "propose_command", { name: "proposal_probe", input: { note: 5 } });
    expect(isError).toBe(true);
    expect(body.code).toBe("invalid_input");
  });

  it("refuses a command the person's roles do not allow", async () => {
    const warehouse = await connectAgent((await makeStaff(breweryId, "warehouse")).email);
    expect((await tool(warehouse.token, "propose_command", { name: "proposal_probe", input: { note: "x" } })).body.code).toBe("permission_denied");
  });

  it.each(["proposal_hidden_probe", "set_brewery_agents_enabled", "approve_agent_proposal", "update_staff_role", "connect_qbo"])("refuses to propose %s", async (name) => {
    expect((await tool(agent.token, "propose_command", { name, input: {} })).body.code).toBe("agent_not_allowed");
  });

  it("cannot be approved by an agent, through any route", async () => {
    const { proposalId } = await propose();
    expect((await tool(agent.token, "run_query", { name: "approve_agent_proposal", input: { proposalId } })).body.code).toBe("agent_not_allowed");
    const { error } = await client(agent.token).rpc("begin_agent_proposal", { p_brewery: breweryId, p_proposal: proposalId });
    expect(error?.code).toBe("42501");
  });

  it("cannot be approved by another staff member", async () => {
    const { proposalId } = await propose();
    const other = await makeStaff(breweryId, "admin");
    const otherCtx = { db: await asUser(other.email), userId: other.id, breweryId, roles: ["admin" as const] };
    await expect(approve(proposalId, otherCtx)).rejects.toMatchObject({ code: "conflict" });
  });

  it("will not run a hidden command stored by calling the RPC directly", async () => {
    const hidden = vi.fn(async () => ({}));
    defineCommand({ name: "proposal_direct_probe", description: "Stored around propose_command", input: z.object({}), roles: ["admin"], agentHidden: true, handler: hidden });
    const { data } = await client(agent.token).rpc("create_agent_proposal", { p_brewery: breweryId, p_command: "proposal_direct_probe", p_input: {} });
    const result = await approve((data as { id: string }).id) as { status: string };
    expect(result.status).toBe("failed");
    expect(hidden).not.toHaveBeenCalled();
  });

  it("will not run in a different brewery from the one it was proposed for", async () => {
    const other = await makeBrewery();
    sql(`insert into public.brewery_users (brewery_id, user_id, roles) values ('${other.id}', '${person.id}', array['admin']::public.staff_role[])`);
    handler.mockClear();
    const { proposalId } = await tool(agent.token, "propose_command", { name: "proposal_probe", breweryId, input: { note: "wrong brewery" } }).then(r => r.body);
    await expect(approve(proposalId, { ...ctx, breweryId: other.id })).rejects.toMatchObject({ code: "conflict" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("only an agent can create a proposal", async () => {
    const { error } = await ctx.db.rpc("create_agent_proposal", { p_brewery: breweryId, p_command: "proposal_probe", p_input: {} });
    expect(error?.code).toBe("42501");
  });

  it("reads as expired once its time passes, and cannot be approved", async () => {
    const { proposalId } = await propose();
    sql(`update public.agent_proposals set expires_at = now() - interval '1 minute' where id = '${proposalId}'`);
    expect((await tool(agent.token, "run_query", { name: "get_proposal_status", input: { proposalId } })).body.data.status).toBe("expired");
    await expect(approve(proposalId)).rejects.toMatchObject({ code: "conflict" });
  });

  it("can be declined, and then not approved", async () => {
    const { proposalId } = await propose();
    await runCommand("decline_agent_proposal", { proposalId }, ctx, { requestId: randomUUID(), correlationId: randomUUID() });
    expect((await tool(agent.token, "run_query", { name: "get_proposal_status", input: { proposalId } })).body.data.status).toBe("declined");
    await expect(approve(proposalId)).rejects.toMatchObject({ code: "conflict" });
  });

  it("records why a command was refused at commit", async () => {
    const { proposalId } = await propose("refuse");
    const result = await approve(proposalId) as { status: string; failure: string };
    expect(result).toEqual({ status: "failed", failure: "That is not allowed right now." });
    const status = await tool(agent.token, "run_query", { name: "get_proposal_status", input: { proposalId } });
    expect(status.body.data).toMatchObject({ status: "failed", failure: "That is not allowed right now." });
  });

  it("lists what is waiting for the person", async () => {
    const { proposalId } = await propose("inbox");
    const waiting = await runCommand("list_agent_proposals", {}, ctx) as { id: string }[];
    expect(waiting.map(p => p.id)).toContain(proposalId);
  });
});
