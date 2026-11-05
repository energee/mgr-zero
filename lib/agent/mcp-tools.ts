// lib/agent/mcp-tools.ts — what an outside agent gets over MCP. These tools hold no
// business logic: every read goes through runCommand, so roles, agentHidden and the
// database guards apply exactly as they do on /api/command.
import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { boundToolResult } from "@/lib/chat/agent";
import { requireAdmission } from "@/lib/commands/admission";
import { buildContextFromBearer } from "@/lib/commands/context";
import { CommandError, runCommand } from "@/lib/commands/registry";

export const AGENT_INSTRUCTIONS = `MGR runs a brewery: beer, orders, inventory, production and compliance.
You act as one person and can do only what their roles allow. Call get_started first.
Use run_query to read. Volumes are stored in bbl and money in cents.
The inventory ledger is append-only, so a correction is a new entry, never an edit.
You cannot change anything yet.`;

type Brewery = { id: string; name: string };

async function breweriesOf(token: string): Promise<Brewery[]> {
  const breweries = await runCommand("list_my_agent_breweries", {}, await buildContextFromBearer(undefined, token)) as Brewery[];
  return breweries.map(({ id, name }) => ({ id, name }));
}

/** Most people work at one brewery, so an agent need not name it. */
async function soleBrewery(token: string) {
  const breweries = await breweriesOf(token);
  if (breweries.length === 1) return breweries[0].id;
  const message = breweries.length ? "Name a breweryId from get_started." : "No brewery you work at allows agents.";
  throw new CommandError(message, 400, "invalid_input", [{ path: ["breweryId"], code: "required", message }]);
}

async function runQuery(token: string, { name, breweryId, input }: { name: string; breweryId?: string; input?: Record<string, unknown> }) {
  const ctx = await buildContextFromBearer(breweryId ?? await soleBrewery(token), token);
  await requireAdmission(ctx.db);
  return boundToolResult(await runCommand(name, input ?? {}, ctx));
}

/** Answers with the JSON a model reads, and turns a refusal into a result it can correct. */
async function answer(run: () => Promise<unknown>) {
  try {
    return { content: [{ type: "text" as const, text: JSON.stringify(await run()) }] };
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    const { code, message, issues } = error;
    return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ code, message, issues }) }] };
  }
}

export function registerAgentTools(server: McpServer) {
  const tokenOf = (ctx: { http?: { authInfo?: AuthInfo } }) => ctx.http!.authInfo!.token;
  server.registerTool("get_started", {
    description: "Call this first. Says which breweries you can reach as this person.",
    inputSchema: z.object({}),
  }, (_input, ctx) => answer(async () => ({ breweries: await breweriesOf(tokenOf(ctx)) })));
  server.registerTool("run_query", {
    description: "Run one MGR read by name, such as get_today. Name a breweryId when get_started lists more than one.",
    inputSchema: z.object({
      name: z.string().describe("The query to run"),
      breweryId: z.uuid().optional().describe("Which brewery, from get_started"),
      input: z.record(z.string(), z.unknown()).optional().describe("The query's input"),
    }),
  }, (input, ctx) => answer(() => runQuery(tokenOf(ctx), input)));
}

/** Only an agent's OAuth token may use MCP: a person's own token would skip the agent limits. */
export async function verifyAgentToken(_request: Request, token?: string): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  try {
    const { agent } = await buildContextFromBearer(undefined, token);
    return agent && { token, clientId: agent.clientId, scopes: [] };
  } catch (error) {
    if (error instanceof CommandError && error.code === "unauthenticated") return undefined;
    throw error;
  }
}
