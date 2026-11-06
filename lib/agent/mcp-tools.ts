// lib/agent/mcp-tools.ts — what an outside agent gets over MCP. These tools hold no
// business logic: every read goes through runCommand, so roles, agentHidden and the
// database guards apply exactly as they do on /api/command.
import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { boundToolResult } from "@/lib/chat/agent";
import { requireAdmission } from "@/lib/commands/admission";
import { buildContextFromBearer } from "@/lib/commands/context";
import { canRun, CommandError, listTools, runCommand } from "@/lib/commands/registry";
import { fieldsOf, leafFields, sampleInput } from "@/lib/mgr/api-schema";
import { fieldMeaning } from "@/lib/mgr/field-vocabulary";

export const AGENT_INSTRUCTIONS = `MGR runs a brewery: beer, orders, inventory, production and compliance.
You act as one person and can do only what their roles allow. Call get_started first.
Use find_operations to see what you can read, describe_operation to learn its input, and run_query to run it.
Volumes are stored in bbl and money in cents.
The inventory ledger is append-only, so a correction is a new entry, never an edit.
You cannot change anything yet.`;

type Brewery = { id: string; name: string; timezone: string };

async function breweriesOf(token: string): Promise<Brewery[]> {
  return await runCommand("list_my_agent_breweries", {}, await buildContextFromBearer(undefined, token)) as Brewery[];
}

/** Most people work at one brewery, so an agent need not name it. */
async function soleBrewery(token: string) {
  const breweries = await breweriesOf(token);
  if (breweries.length === 1) return breweries[0].id;
  const message = breweries.length ? "Name a breweryId from get_started." : "No brewery you work at allows agents.";
  throw new CommandError(message, 400, "invalid_input", [{ path: ["breweryId"], code: "required", message }]);
}

type BreweryChoice = { breweryId?: string };

const contextFor = async (token: string, { breweryId }: BreweryChoice) =>
  buildContextFromBearer(breweryId ?? await soleBrewery(token), token);

async function runQuery(token: string, { name, input, ...choice }: BreweryChoice & { name: string; input?: Record<string, unknown> }) {
  const ctx = await contextFor(token, choice);
  await requireAdmission(ctx.db);
  return boundToolResult(await runCommand(name, input ?? {}, ctx));
}

/** What this person's agent may read at one brewery. */
async function readableOperations(token: string, choice: BreweryChoice) {
  const ctx = await contextFor(token, choice);
  return listTools().filter(tool => tool.kind === "query" && tool.scope === "tenant" && !tool.agentHidden && canRun(ctx, tool.name));
}

async function findOperations(token: string, { text, ...choice }: BreweryChoice & { text?: string }) {
  const words = text?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const operations = await readableOperations(token, choice);
  // Not boundToolResult: its row cap is for data, and would hide operations from the agent.
  return operations
    .filter(({ name, description }) => words.every(word => `${name} ${description}`.toLowerCase().includes(word)))
    .map(({ name, description }) => ({ name, description }));
}

async function describeOperation(token: string, { name, ...choice }: BreweryChoice & { name: string }) {
  const operation = (await readableOperations(token, choice)).find(tool => tool.name === name);
  if (!operation) throw new CommandError(`agents cannot run ${name}`, 403, "agent_not_allowed");
  return {
    name,
    description: operation.description,
    fields: fieldsOf(operation.inputSchema),
    meanings: Object.fromEntries(leafFields(operation.inputSchema).map(field => [field.name, fieldMeaning(field)])),
    example: sampleInput(operation.inputSchema),
  };
}

/** Who the agent acts for, and today's work when there is one brewery to ask about. */
async function getStarted(token: string) {
  const breweries = await breweriesOf(token);
  const withRoles = await Promise.all(breweries.map(async ({ id, name, timezone }) =>
    ({ id, name, timezone, roles: (await buildContextFromBearer(id, token)).roles })));
  const today = breweries.length === 1 ? (await runQuery(token, { name: "get_today" })).data : undefined;
  return { breweries: withRoles, today };
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

const breweryId = z.uuid().optional().describe("Which brewery, from get_started");

export function registerAgentTools(server: McpServer) {
  const tokenOf = (ctx: { http?: { authInfo?: AuthInfo } }) => ctx.http!.authInfo!.token;
  server.registerTool("get_started", {
    description: "Call this first. Says which breweries you can reach as this person, your roles there, and today's work.",
    inputSchema: z.object({}),
  }, (_input, ctx) => answer(() => getStarted(tokenOf(ctx))));
  server.registerTool("find_operations", {
    description: "List the reads you can run, optionally matching words in their name or description.",
    inputSchema: z.object({ text: z.string().optional().describe("Words to match, such as 'unpaid invoices'"), breweryId }),
  }, (input, ctx) => answer(() => findOperations(tokenOf(ctx), input)));
  server.registerTool("describe_operation", {
    description: "Explain one read: what it does, what each input field means, and an example input.",
    inputSchema: z.object({ name: z.string().describe("The operation, from find_operations"), breweryId }),
  }, (input, ctx) => answer(() => describeOperation(tokenOf(ctx), input)));
  server.registerTool("run_query", {
    description: "Run one MGR read by name, such as get_today. Name a breweryId when get_started lists more than one.",
    inputSchema: z.object({
      name: z.string().describe("The query to run"),
      breweryId,
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
