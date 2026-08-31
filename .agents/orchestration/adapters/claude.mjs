import { readFile } from "node:fs/promises";
import { runProcess } from "../lib/process.mjs";

export async function runClaude({ cwd, prompt, schemaPath, timeoutMs }) {
  const schema = await readFile(schemaPath, "utf8");
  const command = process.env.AGENT_WORKFLOW_CLAUDE_BIN || "claude";
  return runProcess(command, [
    "-p",
    "--no-session-persistence",
    "--permission-mode", "plan",
    "--output-format", "json",
    "--json-schema", schema,
    prompt,
  ], { cwd, timeoutMs });
}
