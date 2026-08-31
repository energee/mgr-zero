import { runProcess } from "../lib/process.mjs";

export function runPi({ cwd, prompt, timeoutMs }) {
  const command = process.env.AGENT_WORKFLOW_PI_BIN || "pi";
  return runProcess(command, [
    "--no-session",
    "--tools", "read,grep,find,ls",
    "--mode", "json",
    "--print", prompt,
  ], { cwd, timeoutMs });
}
