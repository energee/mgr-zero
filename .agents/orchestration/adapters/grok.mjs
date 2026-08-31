import { readFile } from "node:fs/promises";
import { runProcess } from "../lib/process.mjs";

export const bin = () => process.env.AGENT_WORKFLOW_GROK_BIN || "grok";

export async function runGrok({ cwd, prompt, schemaPath, timeoutMs }) {
  const schema = await readFile(schemaPath, "utf8");
  return runProcess(bin(), [
    "--cwd", cwd,
    "--no-subagents",
    "--disable-web-search",
    "--permission-mode", "plan",
    "--output-format", "json",
    "--json-schema", schema,
    "--single", prompt,
  ], { cwd, timeoutMs });
}
