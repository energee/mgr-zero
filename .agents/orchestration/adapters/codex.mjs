import { runProcess } from "../lib/process.mjs";

export function runCodex({ cwd, prompt, schemaPath, timeoutMs }) {
  const command = process.env.AGENT_WORKFLOW_CODEX_BIN || "codex";
  return runProcess(command, [
    "exec",
    "--json",
    "--sandbox", "workspace-write",
    "--cd", cwd,
    "--output-schema", schemaPath,
    prompt,
  ], { cwd, timeoutMs });
}
