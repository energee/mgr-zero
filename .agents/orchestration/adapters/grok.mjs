import { readFile } from "node:fs/promises";
import { runProcess } from "../lib/process.mjs";

export async function runGrok({ cwd, prompt, schemaPath, timeoutMs }) {
  const schema = await readFile(schemaPath, "utf8");
  const command = process.env.AGENT_WORKFLOW_GROK_BIN || "grok";
  return runProcess(command, [
    "--cwd", cwd,
    "--no-subagents",
    "--disable-web-search",
    "--permission-mode", "plan",
    "--output-format", "json",
    "--json-schema", schema,
    "--single", prompt,
  ], { cwd, timeoutMs });
}
