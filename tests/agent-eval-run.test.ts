// tests/agent-eval-run.test.ts — the runner's loop, driven by a scripted model. Proves the
// harness end to end with no paid call: model, tools, transcript, score.
import { describe, expect, it, vi } from "vitest";
import { runEvalCase, type EvalModel, type EvalTools } from "@/lib/mgr/agent-eval-run";
import { aggregate, scoreTranscript, type EvalCase, type Operations } from "@/lib/mgr/agent-eval-score";

const item: EvalCase = {
  id: "read-on-hand", kind: "read", source: "author", role: "warehouse",
  prompt: "How many cases of Pils are left?", expectation: { facts: [{ contains: "48" }] },
};
const operations: Operations = new Map([["get_on_hand", { kind: "query", roles: ["warehouse"], fields: [] }]]);
const toolList = [{ name: "find_operations" }, { name: "run_query" }];

function scripted(...turns: Awaited<ReturnType<EvalModel>>[]): EvalModel {
  return vi.fn(async () => {
    const turn = turns.shift();
    if (!turn) throw new Error("The script ran out");
    return turn;
  });
}

const tools = (): EvalTools => ({
  list: async () => toolList,
  call: vi.fn(async (name: string) => ({ content: [{ type: "text", text: name === "run_query" ? '{"data":[{"qty":48}]}' : "[]" }] })),
});

describe("runEvalCase", () => {
  it("runs tool calls until the model answers, and saves a transcript the scorer accepts", async () => {
    const model = scripted(
      { toolCalls: [{ name: "find_operations", input: { text: "on hand" } }] },
      { toolCalls: [{ name: "run_query", input: { name: "get_on_hand" } }] },
      { answer: "There are 48 cases." },
    );
    const transcript = await runEvalCase({ item, order: "normal", model, tools: tools() });
    expect(transcript.answer).toBe("There are 48 cases.");
    expect(transcript.calls.map(call => call.name)).toEqual(["find_operations", "run_query"]);
    const result = scoreTranscript(item, transcript, operations);
    expect(result).toMatchObject({ status: "pass", toolCalls: 2 });
    expect(aggregate([result]).o5MedianToolCalls).toBe(2);
  });

  it("gives the model only the prompt, never the expectation", async () => {
    const model = scripted({ answer: "48" });
    await runEvalCase({ item, order: "normal", model, tools: tools() });
    expect(JSON.stringify(vi.mocked(model).mock.calls[0])).not.toContain("expectation");
    expect(vi.mocked(model).mock.calls[0][0].prompt).toBe(item.prompt);
  });

  it("flips the tool list for a reversed run", async () => {
    const model = scripted({ answer: "48" });
    await runEvalCase({ item, order: "reversed", model, tools: tools() });
    expect(vi.mocked(model).mock.calls[0][0].tools.map(tool => tool.name)).toEqual(["run_query", "find_operations"]);
  });

  it("hands each tool result back to the model", async () => {
    const model = scripted({ toolCalls: [{ name: "run_query", input: { name: "get_on_hand" } }] }, { answer: "48" });
    await runEvalCase({ item, order: "normal", model, tools: tools() });
    expect(vi.mocked(model).mock.calls[1][0].calls).toHaveLength(1);
  });

  it("stops a model that never answers, and scores it as a miss", async () => {
    const looping: EvalModel = async () => ({ toolCalls: [{ name: "find_operations", input: {} }] });
    const transcript = await runEvalCase({ item, order: "normal", model: looping, tools: tools(), maxSteps: 3 });
    expect(transcript.calls).toHaveLength(3);
    expect(transcript.answer).toBe("");
    expect(scoreTranscript(item, transcript, operations).status).toBe("fail");
  });
});
