import { tool, type ToolSet } from "ai";
import { listTools, previewCommand, runCommand, type CommandPreview, type Ctx } from "@/lib/commands/registry";

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

export type ComposerProposal = CommandPreview & { name: string; input: unknown };

export function createComposerTools(ctx: Ctx, conversationId: string, onProposal?: (proposal: ComposerProposal) => void): ToolSet {
  let proposalPending = false;
  return Object.fromEntries(listTools({ aiOnly: true, ctx }).map((definition) => [definition.name, tool({
    description: definition.description,
    inputSchema: definition.inputSchema,
    execute: async (input) => {
      if (definition.kind === "query") return boundToolResult(await runCommand(definition.name, input, ctx));
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
  })]));
}
