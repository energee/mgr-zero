// lib/mgr/agent-readiness.ts — counts the registry-backed rows of the readiness
// scorecard in docs/plans/agent-access.md: how much an agent can learn about each
// operation from the operation itself. scripts/agent-readiness.ts prints them.
import type { $ZodType } from "zod/v4/core";
import { leafFields } from "@/lib/mgr/api-schema";
import { FIELD_VOCABULARY, isIdField } from "@/lib/mgr/field-vocabulary";
import { idFieldKinds } from "@/lib/mgr/proposal-labels";

export type ReadinessTool = {
  name: string;
  kind: "query" | "command";
  description: string;
  inputSchema: $ZodType;
  compensation?: string | null;
};

/** Below this, a description rarely says more than the operation's name. */
const MIN_DESCRIPTION_WORDS = 7;

export function measureReadiness(tools: ReadinessTool[]) {
  const commands = tools.filter(tool => tool.kind === "command");
  const fields = tools.flatMap(tool => leafFields(tool.inputSchema));
  const commandIdFields = commands.flatMap(command => leafFields(command.inputSchema)
    .filter(field => isIdField(field.name))
    .map(field => ({ command: command.name, field: field.name })));
  return {
    operations: tools.length,
    queries: tools.length - commands.length,
    commands: commands.length,
    describedOperations: tools.filter(tool => tool.description.trim().split(/\s+/).length >= MIN_DESCRIPTION_WORDS).length,
    fieldUses: fields.length,
    // A field means something when its schema says so or its name is in the vocabulary.
    fieldUsesWithMeaning: fields.filter(field => field.description || Object.hasOwn(FIELD_VOCABULARY, field.name)).length,
    // `compensation` defaults to null, which says nothing, so only written text counts.
    commandsWithUndo: commands.filter(command => command.compensation).length,
    commandIdFieldUses: commandIdFields.length,
    // An id field is shown as a name when lib/mgr/proposal-labels.ts has a read for its kind.
    commandIdFieldUsesNamed: commandIdFields.filter(({ command, field }) => idFieldKinds(command, field).length > 0).length,
  };
}
