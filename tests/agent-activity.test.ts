// tests/agent-activity.test.ts — only an Admin reads what models did, and no model can.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import "@/lib/commands/all";
import { listTools, runCommand, type Ctx } from "@/lib/commands/registry";
import { client, connectAgent } from "./agent-oauth";
import { asUser, makeBrewery, makeStaff, sql } from "./helpers";

describe("agent activity queries", () => {
  let breweryId: string;
  let sessionId: string;
  let admin: Ctx;
  let person: { id: string; email: string };

  beforeAll(async () => {
    breweryId = (await makeBrewery()).id;
    person = await makeStaff(breweryId, "admin");
    admin = { db: await asUser(person.email), userId: person.id, breweryId, roles: ["admin"] };
    sessionId = sql(`insert into public.agent_sessions (brewery_id, actor_id, client_id) values ('${breweryId}', '${person.id}', '${randomUUID()}') returning id`, true)[0];
    sql(`insert into public.agent_session_steps (brewery_id, session_id, tool, operation, outcome, error_code, duration_ms, created_at) values
      ('${breweryId}', '${sessionId}', 'run_query', 'get_today', 'ok', null, 1, now() - interval '1 minute'),
      ('${breweryId}', '${sessionId}', 'run_query', 'get_on_hand', 'refused', 'invalid_input', 1, now())`);
    sql(`insert into public.agent_session_notes (brewery_id, session_id, kind, body) values ('${breweryId}', '${sessionId}', 'handoff', 'Left off at bins.')`);
  });

  it("lists sessions with their counts and the person", async () => {
    const sessions = await runCommand("list_agent_sessions", {}, admin) as Record<string, unknown>[];
    expect(sessions).toEqual([expect.objectContaining({ id: sessionId, person: person.email, clientName: null, steps: 2, problems: 1, notes: 1 })]);
  });

  it("names a real client, whose name only the server can read", async () => {
    const agent = await connectAgent(person.email);
    sql(`update public.breweries set agents_enabled = true where id = '${breweryId}'`);
    const { error } = await client(agent.token).rpc("record_agent_step", { p_brewery: breweryId, p_tool: "get_started", p_outcome: "ok", p_duration_ms: 1 });
    expect(error).toBeNull();
    const sessions = await runCommand("list_agent_sessions", {}, admin) as { clientName: string | null }[];
    expect(sessions[0].clientName).toEqual(expect.any(String));
    sql(`delete from public.agent_sessions where brewery_id = '${breweryId}' and id <> '${sessionId}'`);
  });

  it("opens one session with its steps and notes", async () => {
    const session = await runCommand("get_agent_session", { sessionId }, admin) as { stepRows: { operation: string }[]; noteRows: { body: string }[] };
    expect(session.stepRows.map(step => step.operation)).toEqual(["get_today", "get_on_hand"]);
    expect(session.noteRows.map(note => note.body)).toEqual(["Left off at bins."]);
  });

  it("answers not found for a session at another brewery", async () => {
    const other = (await makeBrewery()).id;
    const stranger = await makeStaff(other, "admin");
    const ctx = { db: await asUser(stranger.email), userId: stranger.id, breweryId: other, roles: ["admin" as const] };
    await expect(runCommand("get_agent_session", { sessionId }, ctx)).rejects.toMatchObject({ code: "not_found" });
    expect(await runCommand("list_agent_sessions", {}, ctx)).toEqual([]);
  });

  it("refuses anyone but an Admin", async () => {
    const warehouse = await makeStaff(breweryId, "warehouse");
    const ctx = { db: await asUser(warehouse.email), userId: warehouse.id, breweryId, roles: ["warehouse" as const] };
    await expect(runCommand("list_agent_sessions", {}, ctx)).rejects.toMatchObject({ code: "permission_denied" });
    const { error } = await ctx.db.rpc("list_agent_sessions", { p_brewery: breweryId });
    expect(error?.code).toBe("42501");
  });

  it("keeps the log from models, because notes are text a model wrote", () => {
    const hidden = listTools().filter(tool => tool.agentHidden).map(tool => tool.name);
    expect(hidden).toEqual(expect.arrayContaining(["list_agent_sessions", "get_agent_session"]));
  });
});
