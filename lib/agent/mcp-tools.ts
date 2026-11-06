// lib/agent/mcp-tools.ts — what an outside agent gets over MCP. These tools hold no
// business logic: every read goes through runCommand, so roles, agentHidden and the
// database guards apply exactly as they do on /api/command.
import type { AuthInfo, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { DESCRIBE_OPERATION, describeOperation, FIND_OPERATIONS, findOperations, operationsFor } from "@/lib/agent/operations";
import { boundToolResult } from "@/lib/chat/agent";
import { requireAdmission } from "@/lib/commands/admission";
import { buildContextFromBearer } from "@/lib/commands/context";
import { isProposable } from "@/lib/commands/agent-proposals";
import { canRun, CommandError, getCommandDefinition, parseInput, runCommand, unwrap } from "@/lib/commands/registry";
import { readAppUrl } from "@/lib/env/server-parser";

export const AGENT_INSTRUCTIONS = `MGR runs a brewery: beer, orders, inventory, production and compliance.
You act as one person and can do only what their roles allow. Call get_started first.
Use find_operations to see what you can do, describe_operation to learn its input, and run_query to read.
Use search_guide to learn how MGR works before you act on something you are unsure of.
To change anything, call propose_command. A change waits until your person approves it in MGR.
Volumes are stored in bbl and money in cents.
The inventory ledger is append-only, so a correction is a new entry, never an edit.
You can never commit a change yourself.`;

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

/** What this person's agent may read or propose at one brewery. */
async function agentOperations(token: string, choice: BreweryChoice) {
  return operationsFor(await contextFor(token, choice));
}

async function proposeCommand(token: string, { name, input, ...choice }: BreweryChoice & { name: string; input?: Record<string, unknown> }) {
  const ctx = await contextFor(token, choice);
  await requireAdmission(ctx.db);
  if (!isProposable(name)) throw new CommandError(`agents cannot propose ${name}`, 403, "agent_not_allowed");
  if (!canRun(ctx, name)) throw new CommandError(`permission denied: ${name}`, 403, "permission_denied");
  const parsed = parseInput(getCommandDefinition(name)!.input, input ?? {});
  const proposal = await unwrap(ctx.db.rpc("create_agent_proposal", { p_brewery: ctx.breweryId, p_command: name, p_input: parsed as never })) as { id: string; expiresAt: string };
  return { status: "awaiting_approval", proposalId: proposal.id, approveUrl: `${readAppUrl()}/proposals/${proposal.id}`, expiresAt: proposal.expiresAt };
}

/** The guides are public, so this asks the same endpoint the docs search box uses. */
async function searchGuide({ query }: { query: string }) {
  const origin = readAppUrl();
  const response = await fetch(`${origin}/api/search?${new URLSearchParams({ query })}`);
  if (!response.ok) throw new Error(`guide search answered ${response.status}`);
  const hits = await response.json() as { content: string; url: string }[];
  return hits.map(({ content, url }) => ({ text: content, url: `${origin}${url}` }));
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
    description: FIND_OPERATIONS,
    inputSchema: z.object({ text: z.string().optional().describe("Words to match, such as 'unpaid invoices'"), breweryId }),
  }, ({ text, ...choice }, ctx) => answer(async () => findOperations(await agentOperations(tokenOf(ctx), choice), text)));
  server.registerTool("describe_operation", {
    description: DESCRIBE_OPERATION,
    inputSchema: z.object({ name: z.string().describe("The operation, from find_operations"), breweryId }),
  }, ({ name, ...choice }, ctx) => answer(async () => describeOperation(await agentOperations(tokenOf(ctx), choice), name)));
  server.registerTool("search_guide", {
    description: "Search the MGR guides for how something works, such as 'how reversals work'. Start at the How MGR works guide.",
    inputSchema: z.object({ query: z.string().describe("What to look up") }),
  }, (input) => answer(() => searchGuide(input)));
  server.registerTool("propose_command", {
    description: "Propose a change. It runs only after your person approves it in MGR, so say what you proposed and share the approveUrl.",
    inputSchema: z.object({
      name: z.string().describe("The command to propose, from find_operations"),
      breweryId,
      input: z.record(z.string(), z.unknown()).optional().describe("The command's input"),
    }),
  }, (input, ctx) => answer(() => proposeCommand(tokenOf(ctx), input)));
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
