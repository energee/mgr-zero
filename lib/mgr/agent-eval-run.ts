// lib/mgr/agent-eval-run.ts — runs one eval case: the model calls tools until it answers,
// and the result is a transcript for lib/mgr/agent-eval-score.ts. The model and tools are
// passed in, so the loop runs offline with a scripted model and live with a real one.
import type { EvalCase, ToolCall, Transcript } from "@/lib/mgr/agent-eval-score";

type Tool = { name: string };
type Request = { name: string; input: Record<string, unknown> };

/** One model turn: it sees the prompt, the tools and every call so far, never the expectation. */
export type EvalModel = (turn: { prompt: string; tools: Tool[]; calls: ToolCall[] }) =>
  Promise<{ answer: string } | { toolCalls: Request[] }>;

export type EvalTools = {
  list: () => Promise<Tool[]>;
  call: (name: string, input: Record<string, unknown>) => Promise<ToolCall["result"]>;
};

export async function runEvalCase({ item, order, model, tools, maxSteps = 12 }: {
  item: EvalCase;
  order: Transcript["order"];
  model: EvalModel;
  tools: EvalTools;
  maxSteps?: number;
}): Promise<Transcript> {
  const listed = await tools.list();
  const toolList = order === "reversed" ? [...listed].reverse() : listed;
  const calls: ToolCall[] = [];
  for (let step = 0; step < maxSteps; step += 1) {
    const turn = await model({ prompt: item.prompt, tools: toolList, calls });
    if ("answer" in turn) return { prompt: item.prompt, order, calls, answer: turn.answer };
    for (const { name, input } of turn.toolCalls) calls.push({ name, input, result: await tools.call(name, input) });
  }
  // No answer in the budget. The scorer finds no facts in an empty answer, so this is a miss.
  return { prompt: item.prompt, order, calls, answer: "" };
}
