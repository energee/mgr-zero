// lib/agent/sessions.ts — logs what a model did: names, codes and timings, never input
// or output values, because those are tenant data. docs/plans/agent-access.md, Phase 4.
import { CommandError, type Ctx, getCommandDefinition } from "@/lib/commands/registry";

export type AgentStep = {
  tool: string;
  operation?: string;
  kind?: "query" | "command";
  outcome: "ok" | "refused" | "failed";
  errorCode?: string;
  inputPath?: string;
  proposalId?: string;
  durationMs: number;
};

/** The failing path, up to the first part that is not a field name. A record's keys are input, so they may be anything. */
function safePath(path: (string | number)[] = []) {
  const end = path.findIndex(part => !/^[A-Za-z0-9_]{1,64}$/.test(String(part)));
  const kept = path.slice(0, end === -1 ? 8 : Math.min(end, 8));
  return kept.length ? kept.join(".") : undefined;
}

/** What a failed tool call says about itself. A 4xx is MGR refusing; anything else is a fault. */
export function failureOf(error: unknown): Pick<AgentStep, "outcome" | "errorCode" | "inputPath"> {
  if (!(error instanceof CommandError)) return { outcome: "failed" };
  return {
    outcome: error.status < 500 ? "refused" : "failed",
    errorCode: error.code,
    inputPath: safePath(error.issues?.[0]?.path),
  };
}

type ToolEnd = { toolName: string; input: unknown; durationMs: number; output: { type: "tool-result"; output: unknown } | { type: "tool-error"; error: unknown } };

function askMgrStepName(toolName: string, input: unknown): Pick<AgentStep, "tool" | "operation" | "kind"> {
  const { name } = input as { name?: string };
  switch (toolName) {
    case "find_operations": return { tool: toolName };
    case "describe_operation": return { tool: toolName, operation: name };
    case "run_query": return { tool: toolName, operation: name, kind: "query" };
    default: return { tool: toolName, operation: toolName, kind: "command" };
  }
}

/** Ask MGR's step, from the AI SDK's end-of-tool event. A soft `{ error }` is a refused preview. */
export function askMgrStep({ toolName, input, durationMs, output }: ToolEnd): AgentStep {
  const step = { ...askMgrStepName(toolName, input), durationMs };
  if (output.type === "tool-error") return { ...step, ...failureOf(output.error) };
  return { ...step, outcome: (output.output as { error?: string }).error ? "refused" : "ok" };
}

/** Never fails the model's work. A failure logs under one tag, so the logs can count it. */
export async function recordAgentStep(ctx: Ctx, conversationId: string | null, step: AgentStep): Promise<void> {
  const { error } = await ctx.db.rpc("record_agent_step", {
    p_brewery: ctx.breweryId, p_tool: step.tool, p_outcome: step.outcome, p_duration_ms: Math.round(step.durationMs),
    p_conversation: conversationId ?? undefined, p_kind: step.kind, p_error_code: step.errorCode,
    // A model picks these, so an unknown name could be anything it pasted.
    p_operation: step.operation && getCommandDefinition(step.operation) ? step.operation : undefined,
    p_input_path: step.inputPath, p_proposal: step.proposalId,
  });
  if (error) console.error("agent_step_unrecorded", { tool: step.tool, code: error.code });
}
