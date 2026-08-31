import { runProcess } from "../lib/process.mjs";

export const bin = () => process.env.AGENT_WORKFLOW_CODEX_BIN || "codex";

export function runCodex({ cwd, prompt, schemaPath, timeoutMs }) {
  return runProcess(bin(), [
    "exec",
    "--json",
    "--sandbox", "workspace-write",
    "--cd", cwd,
    "--output-schema", schemaPath,
    prompt,
  ], { cwd, timeoutMs });
}
