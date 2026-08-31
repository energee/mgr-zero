import { readFile } from "node:fs/promises";
import { runProcess } from "../lib/process.mjs";

export const bin = () => process.env.AGENT_WORKFLOW_CLAUDE_BIN || "claude";

export async function runClaude({ cwd, prompt, schemaPath, timeoutMs }) {
  const schema = await readFile(schemaPath, "utf8");
  return runProcess(bin(), [
    "-p",
    "--no-session-persistence",
    "--permission-mode", "plan",
    "--output-format", "json",
    "--json-schema", schema,
    prompt,
  ], { cwd, timeoutMs });
}
