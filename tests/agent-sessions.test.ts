// tests/agent-sessions.test.ts — the log of what models did. It holds names and codes,
// never values, and a failure to log must not fail the model's work.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { askMgrStep, recordAgentStep } from "@/lib/agent/sessions";
import { CommandError, type Ctx } from "@/lib/commands/registry";
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
  return { isError: Boolean(result.isError), text: result.content[0].text as string };
}

type Step = { tool: string; operation: string | null; kind: string | null; outcome: string; error_code: string | null; input_path: string | null; proposal_id: string | null };

describe("agent session log", () => {
  let breweryId: string;
  let person: { email: string; id: string };
  let agent: Awaited<ReturnType<typeof connectAgent>>;

  const rows = (query: string) => JSON.parse(sql(`select coalesce(json_agg(t), '[]') from (${query}) t`, true).join("")) as Step[];
  const steps = () => rows(`select st.* from public.agent_session_steps st join public.agent_sessions s on s.id = st.session_id
    where s.brewery_id = '${breweryId}' order by st.created_at`);
  const lastStep = () => steps().at(-1)!;
  const sessionCount = () => Number(sql(`select count(*) from public.agent_sessions where brewery_id = '${breweryId}'`, true)[0]);

  beforeAll(async () => {
    vi.stubEnv("APP_URL", "https://mgr.test");
    breweryId = (await makeBrewery()).id;
    person = await makeStaff(breweryId, "admin");
    agent = await connectAgent(person.email);
    sql(`update public.breweries set agents_enabled = true where id = '${breweryId}'`);
  });

  it("logs a read by name and outcome", async () => {
    expect((await tool(agent.token, "run_query", { name: "get_today" })).isError).toBe(false);
    expect(lastStep()).toMatchObject({ tool: "run_query", operation: "get_today", kind: "query", outcome: "ok", error_code: null });
  });

  it("logs a refusal with its code", async () => {
    expect((await tool(agent.token, "run_query", { name: "update_staff_role" })).isError).toBe(true);
    expect(lastStep()).toMatchObject({ operation: "update_staff_role", outcome: "refused", error_code: "agent_not_allowed" });
  });

  it("logs the failing input path, never the value", async () => {
    const secret = "customer-secret-value";
    expect((await tool(agent.token, "run_query", { name: "get_on_hand", input: { skuId: secret } })).isError).toBe(true);
    expect(lastStep()).toMatchObject({ outcome: "refused", error_code: "invalid_input", input_path: "skuId" });
    expect(JSON.stringify(steps())).not.toContain(secret);
  });

  it("links a proposal to the step that made it", async () => {
    const location = sql(`insert into public.locations (brewery_id, name, uses) values ('${breweryId}', 'Log warehouse', '{warehouse}') returning id`, true)[0];
    const proposed = await tool(agent.token, "propose_command", { name: "create_bin", input: { locationId: location, name: "Log bin" } });
    expect(lastStep()).toMatchObject({ tool: "propose_command", operation: "create_bin", kind: "command", proposal_id: JSON.parse(proposed.text).proposalId });
  });

  it("keeps one session until 30 idle minutes pass", async () => {
    const before = sessionCount();
    await tool(agent.token, "run_query", { name: "get_today" });
    expect(sessionCount()).toBe(before);
    sql(`update public.agent_sessions set last_seen_at = now() - interval '31 minutes' where brewery_id = '${breweryId}'`);
    await tool(agent.token, "run_query", { name: "get_today" });
    expect(sessionCount()).toBe(before + 1);
  });

  it("stores a note, and refuses one over the cap", async () => {
    expect((await tool(agent.token, "leave_note", { kind: "friction", text: "The bin list needs a location." })).isError).toBe(false);
    expect(sql(`select n.body from public.agent_session_notes n join public.agent_sessions s on s.id = n.session_id where s.brewery_id = '${breweryId}'`, true))
      .toContain("The bin list needs a location.");
    expect((await tool(agent.token, "leave_note", { kind: "friction", text: "x".repeat(501) })).isError).toBe(true);
    const { error } = await client(agent.token).rpc("leave_agent_note", { p_brewery: breweryId, p_kind: "friction", p_body: "x".repeat(501) });
    expect(error?.code).toBe("23514");
  });

  it("shows the log to an Admin only, and an agent cannot write it directly", async () => {
    const admin = await asUser(person.email);
    expect((await admin.from("agent_sessions").select("id")).data?.length).toBeGreaterThan(0);
    expect((await admin.from("agent_session_steps").select("id")).data?.length).toBeGreaterThan(0);
    const warehouse = await asUser((await makeStaff(breweryId, "warehouse")).email);
    expect((await warehouse.from("agent_sessions").select("id")).data).toEqual([]);
    expect((await warehouse.from("agent_session_steps").select("id")).data).toEqual([]);
    const { error } = await client(agent.token).from("agent_session_steps").insert({ session_id: breweryId, tool: "x", outcome: "ok", duration_ms: 0 } as never);
    expect(error).not.toBeNull();
  });

  it("prunes sessions and proposals after 90 days", async () => {
    sql(`update public.agent_sessions set last_seen_at = now() - interval '91 days' where brewery_id = '${breweryId}'`);
    sql(`update public.agent_proposals set expires_at = now() - interval '91 days' where brewery_id = '${breweryId}'`);
    expect(Number(sql(`set role service_role; select public.prune_agent_history()`, true).at(-1))).toBeGreaterThan(0);
    expect(sessionCount()).toBe(0);
    expect(steps()).toEqual([]);
    expect(Number(sql(`select count(*) from public.agent_proposals where brewery_id = '${breweryId}'`, true)[0])).toBe(0);
  });

  it("names Ask MGR's steps from the SDK's event", () => {
    const end = (toolName: string, input: unknown, output: Parameters<typeof askMgrStep>[0]["output"]) => askMgrStep({ toolName, input, durationMs: 5, output });
    const ok = { type: "tool-result", output: { data: [] } } as const;
    expect(end("run_query", { name: "get_today" }, ok)).toMatchObject({ tool: "run_query", operation: "get_today", kind: "query", outcome: "ok" });
    expect(end("find_operations", { text: "bins" }, ok)).toEqual({ tool: "find_operations", outcome: "ok", durationMs: 5 });
    expect(end("record_movement", { qty: 1 }, ok)).toMatchObject({ operation: "record_movement", kind: "command", outcome: "ok" });
    expect(end("record_movement", { qty: 1 }, { type: "tool-result", output: { error: "This action is not allowed." } })).toMatchObject({ outcome: "refused" });
    const refused = new CommandError("no", 403, "agent_not_allowed");
    expect(end("run_query", { name: "secret" }, { type: "tool-error", error: refused })).toMatchObject({ outcome: "refused", errorCode: "agent_not_allowed" });
    expect(end("run_query", { name: "get_today" }, { type: "tool-error", error: new Error("boom") })).toMatchObject({ outcome: "failed" });
  });

  it("logs a recorder failure and does not throw it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = { rpc: async () => ({ error: { code: "XX000", message: "down" } }) } as unknown as Ctx["db"];
    const ctx = { db, userId: "actor", breweryId: "brewery", roles: ["admin"] } as unknown as Ctx;
    await expect(recordAgentStep(ctx, null, { tool: "run_query", outcome: "ok", durationMs: 1 })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("agent_step_unrecorded", { tool: "run_query", code: "XX000" });
    error.mockRestore();
  });
});
