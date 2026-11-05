// tests/mcp-route.test.ts — the MCP endpoint at /api/mcp: who may call it, and what
// an agent can reach through it. Drives the real route with a real agent token.
import { beforeAll, describe, expect, it } from "vitest";
import { GET as resourceMetadata } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import { POST } from "@/app/api/mcp/route";
import { API, client, connectAgent } from "./agent-oauth";
import { makeBrewery, makeStaff, sql } from "./helpers";

const call = (method: string, params: unknown, token?: string) => POST(new Request("http://localhost/api/mcp", {
  method: "POST",
  headers: {
    "content-type": "application/json", accept: "application/json, text/event-stream",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
}));

/** The JSON-RPC result, from a plain JSON body or a single SSE message. */
async function resultOf(response: Response) {
  const text = await response.text();
  return JSON.parse(text.startsWith("{") ? text : text.split("\n").find(line => line.startsWith("data: "))!.slice(6)).result;
}

async function tool(token: string, name: string, args: Record<string, unknown> = {}) {
  const result = await resultOf(await call("tools/call", { name, arguments: args }, token));
  return { isError: Boolean(result.isError), body: JSON.parse(result.content[0].text) };
}

describe("/api/mcp", () => {
  let breweryId: string;
  let email: string;
  let token: string;

  beforeAll(async () => {
    const brewery = await makeBrewery("Mcp Brewing");
    breweryId = brewery.id;
    email = (await makeStaff(breweryId, "admin")).email;
    token = (await connectAgent(email)).token;
    sql(`update public.breweries set agents_enabled = true where id = '${breweryId}'`);
  });

  it("challenges a caller with no token, naming where to sign in", async () => {
    const response = await call("tools/list", {});
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata");
  });

  it("points the challenge at metadata that names this endpoint and Supabase Auth", async () => {
    const challenge = (await call("tools/list", {})).headers.get("www-authenticate")!;
    expect(challenge).toContain('resource_metadata="http://localhost/.well-known/oauth-protected-resource/api/mcp"');
    const metadata = await resourceMetadata(new Request("http://localhost/.well-known/oauth-protected-resource/api/mcp")).json();
    expect(metadata).toEqual({ resource: "http://localhost/api/mcp", authorization_servers: [`${API}/auth/v1`] });
  });

  it("refuses a person's own token, which would skip the agent limits", async () => {
    const person = client();
    const { data } = await person.auth.signInWithPassword({ email, password: "test-password-1" });
    expect((await call("tools/list", {}, data.session!.access_token)).status).toBe(401);
  });

  it("introduces itself as MGR, with instructions", async () => {
    const result = await resultOf(await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }, token));
    expect(result.serverInfo.name).toBe("MGR");
    expect(result.instructions).toContain("get_started");
  });

  it("offers the agent tools", async () => {
    const { tools } = await resultOf(await call("tools/list", {}, token));
    expect(tools.map((t: { name: string }) => t.name).sort()).toEqual(["get_started", "run_query"]);
  });

  it("tells a fresh agent who it acts for and where", async () => {
    const { body } = await tool(token, "get_started");
    expect(body.breweries).toEqual([{ id: breweryId, name: "Mcp Brewing" }]);
  });

  it("runs a query its person's roles allow, defaulting a single brewery", async () => {
    const { isError, body } = await tool(token, "run_query", { name: "get_today" });
    expect(isError).toBe(false);
    expect(body.data).toEqual([]);
  });

  it("runs a query that was never marked for AI", async () => {
    expect((await tool(token, "run_query", { name: "list_invoices", input: {} })).isError).toBe(false);
  });

  it("refuses a hidden query with a code the agent can act on", async () => {
    const { isError, body } = await tool(token, "run_query", { name: "get_qbo_connection" });
    expect(isError).toBe(true);
    expect(body.code).toBe("agent_not_allowed");
  });

  it.each(["list_qbo_customers", "list_chat_channels", "search_colas", "get_chat_history"])("refuses %s, which reaches past the person's database access", async (name) => {
    expect((await tool(token, "run_query", { name, input: {} })).body.code).toBe("agent_not_allowed");
  });

  it("refuses a command", async () => {
    expect((await tool(token, "run_query", { name: "record_movement", input: {} })).body.code).toBe("agent_not_allowed");
  });

  it("names the failing field so a model can correct itself", async () => {
    const { body } = await tool(token, "run_query", { name: "get_today", input: { now: "not a date" } });
    expect(body.code).toBe("invalid_input");
    expect(body.issues[0].path).toEqual(["now"]);
  });

  it("reaches nothing when the brewery has agents off", async () => {
    sql(`update public.breweries set agents_enabled = false where id = '${breweryId}'`);
    try {
      expect((await tool(token, "get_started")).body.breweries).toEqual([]);
      expect((await tool(token, "run_query", { name: "get_today" })).isError).toBe(true);
    } finally {
      sql(`update public.breweries set agents_enabled = true where id = '${breweryId}'`);
    }
  });
});
