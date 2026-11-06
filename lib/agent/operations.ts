// lib/agent/operations.ts — what a model can discover in MGR. MCP and Ask MGR both use
// this, so an operation reaches them by being registered, never by being listed here.
import { canRun, CommandError, listTools, type OperationCtx } from "@/lib/commands/registry";
import { fieldsOf, leafFields, sampleInput } from "@/lib/mgr/api-schema";
import { fieldMeaning } from "@/lib/mgr/field-vocabulary";

type Operation = ReturnType<typeof listTools>[number];

export const FIND_OPERATIONS = "List what you can read or propose, optionally matching words in the name or description.";
export const DESCRIBE_OPERATION = "Explain one operation: what it does, what each input field means, and an example input.";

/** What a model acting for this person may reach at one brewery. A customer reaches only portal operations. */
export function operationsFor(ctx: OperationCtx): Operation[] {
  return listTools().filter(tool => tool.scope === "tenant" && !tool.agentHidden && canRun(ctx, tool.name)
    && (ctx.breweryId === null || !ctx.roles.includes("customer") || tool.name.startsWith("portal_")));
}

export function findOperations(operations: Operation[], text?: string) {
  const words = text?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  // Not boundToolResult: its row cap is for data, and would hide operations from the model.
  return operations
    .filter(({ name, description }) => words.every(word => `${name} ${description}`.toLowerCase().includes(word)))
    .map(({ name, description, kind }) => ({ name, description, kind }));
}

export function describeOperation(operations: Operation[], name: string) {
  const operation = operations.find(tool => tool.name === name);
  if (!operation) throw new CommandError(`agents cannot run ${name}`, 403, "agent_not_allowed");
  return {
    name,
    description: operation.description,
    fields: fieldsOf(operation.inputSchema),
    meanings: Object.fromEntries(leafFields(operation.inputSchema).map(field => [field.name, fieldMeaning(field)])),
    example: sampleInput(operation.inputSchema),
  };
}
