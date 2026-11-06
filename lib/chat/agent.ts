import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { DESCRIBE_OPERATION, describeOperation, FIND_OPERATIONS, findOperations, operationsFor } from "@/lib/agent/operations";
import { requireAdmission } from "@/lib/commands/admission";
import { CommandError, previewCommand, runCommand, type CommandPreview, type Ctx } from "@/lib/commands/registry";

const MAX_ROWS = 50;
const MAX_RESULT_CHARS = 20_000;

export function boundToolResult(value: unknown) {
  const data = Array.isArray(value) ? value.slice(0, MAX_ROWS) : value;
  const returned = Array.isArray(data) ? data.length : undefined;
  const truncated = Array.isArray(value) && value.length > MAX_ROWS;
  if (JSON.stringify(data).length > MAX_RESULT_CHARS) {
    return { data: null, returned: 0, truncated: true, message: "Narrow the request before trying again." };
  }
  return { data, returned, truncated, observedAt: new Date().toISOString() };
}

/** What the agent proposes for a previewed command. Distinct from lib/composer/state's
 *  ComposerProposal, the record_movement proposal the Composer panel renders. */
type ChatCommandProposal = CommandPreview & { name: string; input: unknown };

/** Ask MGR's tools: the same read tools MCP offers, plus one tool per previewed write. */
export function createComposerTools(ctx: Ctx, conversationId: string, onProposal?: (proposal: ChatCommandProposal) => void): ToolSet {
  let proposalPending = false;
  const operations = operationsFor(ctx).filter(({ kind, previewable }) => kind === "query" || previewable);
  const writes = operations.filter(({ kind }) => kind === "command");
  return {
    find_operations: tool({
      description: FIND_OPERATIONS,
      inputSchema: z.object({ text: z.string().optional().describe("Words to match, such as 'unpaid invoices'") }),
      execute: async ({ text }) => findOperations(operations, text),
    }),
    describe_operation: tool({
      description: DESCRIBE_OPERATION,
      inputSchema: z.object({ name: z.string().describe("The operation, from find_operations") }),
      execute: async ({ name }) => describeOperation(operations, name),
    }),
    run_query: tool({
      description: "Run one MGR read by name, such as get_today.",
      inputSchema: z.object({
        name: z.string().describe("The query to run"),
        input: z.record(z.string(), z.unknown()).optional().describe("The query's input"),
      }),
      execute: async ({ name, input }) => {
        // This context has no ctx.agent, so runCommand would run a write or a hidden read. This list is the guard.
        if (!operations.some(operation => operation.name === name && operation.kind === "query")) {
          throw new CommandError(`Ask MGR cannot run ${name}`, 403, "agent_not_allowed");
        }
        await requireAdmission(ctx.db);
        return boundToolResult(await runCommand(name, input ?? {}, ctx));
      },
    }),
    ...Object.fromEntries(writes.map((definition) => [definition.name, tool({
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute: async (input) => {
        if (proposalPending) return { error: "A proposal is already pending confirmation." };
        proposalPending = true;
        const result = await previewCommand(definition.name, input, ctx, conversationId);
        if (!result.valid || !result.allowed || !result.preview) {
          proposalPending = false;
          return { error: result.allowed === false ? "This action is not allowed." : "The proposed action is invalid." };
        }
        const proposal = { name: definition.name, input: result.input, ...result.preview };
        onProposal?.(proposal);
        return { status: "awaiting_confirmation", proposal };
      },
    })])),
  };
}
