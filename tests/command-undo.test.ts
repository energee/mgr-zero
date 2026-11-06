// tests/command-undo.test.ts — every registered command says how it is undone, or
// why it cannot be (U5 in docs/plans/agent-access.md). An agent and the person
// approving its write read this text, so a new command cannot ship without it.
import { expect, it } from "vitest";
import "@/lib/commands/all";
import { listTools } from "@/lib/commands/registry";

it("every command has compensation text", () => {
  const missing = listTools().filter(tool => tool.kind === "command" && !tool.compensation?.trim()).map(tool => tool.name);
  expect(missing).toEqual([]);
});
